import { and, eq, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { config } from '../config.js';
import { notify } from '../lib/activity.js';
import { todayISO } from '../lib/dates.js';
import { alertDetails, levelFor, taskLabel } from './assignment.js';

/**
 * Server-backed reminders, so nothing depends on a browser tab staying open:
 *  - urgent tasks not yet acknowledged: reminded every N minutes, at most M times;
 *  - due today: one reminder per due date;
 *  - overdue: one reminder per due date (assignee and creator).
 * Each reminder is "claimed" with a conditional UPDATE … RETURNING before it is sent,
 * so running several server instances never sends duplicates.
 */

const t = schema.purchaseTasks;

async function urgentAcknowledgementReminders() {
  const every = config.urgentReminderMinutes;
  const claimed = await db
    .update(t)
    .set({ reminderCount: sql`${t.reminderCount} + 1`, lastReminderAt: new Date() })
    .where(
      and(
        eq(t.status, 'pending'),
        eq(t.priority, 'urgent'),
        isNotNull(t.assignedTo),
        isNull(t.acknowledgedAt),
        lt(t.reminderCount, config.urgentReminderMax),
        lte(sql`coalesce(${t.lastReminderAt}, ${t.assignedAt}, ${t.createdAt})`, sql`now() - make_interval(mins => ${every})`),
      ),
    )
    .returning();
  for (const task of claimed) {
    const data = { ...(await alertDetails(task, null)), reminder: task.reminderCount, maxReminders: config.urgentReminderMax };
    await notify([task.assignedTo], null, task.id, 'reminder', `Reminder: urgent task not yet marked as received`, { level: 'urgent', data });
  }
  return claimed.length;
}

async function dueTodayReminders(today: string) {
  const claimed = await db
    .update(t)
    .set({ dueReminderFor: t.dueDate })
    .where(
      and(
        eq(t.status, 'pending'),
        isNotNull(t.assignedTo),
        eq(t.dueDate, today),
        or(isNull(t.dueReminderFor), sql`${t.dueReminderFor} <> ${t.dueDate}`),
      ),
    )
    .returning();
  for (const task of claimed) {
    await notify([task.assignedTo], null, task.id, 'due', `Due today: ${taskLabel(task)}`, {
      level: task.priority === 'normal' ? 'high' : levelFor(task.priority),
      data: await alertDetails(task, null),
    });
  }
  return claimed.length;
}

async function overdueReminders(today: string) {
  const claimed = await db
    .update(t)
    .set({ overdueReminderFor: t.dueDate })
    .where(
      and(
        eq(t.status, 'pending'),
        lt(t.dueDate, today),
        or(isNull(t.overdueReminderFor), sql`${t.overdueReminderFor} <> ${t.dueDate}`),
      ),
    )
    .returning();
  for (const task of claimed) {
    await notify([task.assignedTo, task.createdBy], null, task.id, 'overdue', `Overdue: ${taskLabel(task)}`, {
      level: 'high',
      data: await alertDetails(task, null),
    });
  }
  return claimed.length;
}

export async function runReminders(): Promise<{ urgent: number; due: number; overdue: number }> {
  const today = todayISO();
  return {
    urgent: await urgentAcknowledgementReminders(),
    due: await dueTodayReminders(today),
    overdue: await overdueReminders(today),
  };
}

let timer: NodeJS.Timeout | undefined;

export function startReminderScheduler(): void {
  if (timer || config.reminderCheckSeconds <= 0) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runReminders();
    } catch (e) {
      console.error('[reminders]', e);
    } finally {
      running = false;
    }
  };
  timer = setInterval(tick, config.reminderCheckSeconds * 1000);
  timer.unref();
  setTimeout(tick, 5_000).unref();
}

export function stopReminderScheduler(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
