import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { sendToUser } from './events.js';

export type ActivityAction =
  | 'created'
  | 'updated'
  | 'assigned'
  | 'reassigned'
  | 'acknowledged'
  | 'started'
  | 'priority_changed'
  | 'due_date_changed'
  | 'structure_changed'
  | 'action_changed'
  | 'closed'
  | 'reopened'
  | 'commented'
  | 'voice_note_added'
  | 'attachment_added'
  | 'attachment_deleted'
  | 'deleted';

export async function logActivity(
  taskId: number | null,
  userId: number | null,
  action: ActivityAction,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(schema.activityLogs).values({ taskId, userId, action, metadata });
}

export type AlertLevel = 'normal' | 'high' | 'urgent';

export interface NotifyOptions {
  /** Drives sound / browser alerts on the client. */
  level?: AlertLevel;
  /** Structured details for rich display (title, structure path, action, due date, …). */
  data?: Record<string, unknown>;
}

/**
 * In-app notifications. Kept deliberately sparse: assignment, closure of your request,
 * urgent tasks in your sections, replies on tasks you are involved in, and server reminders.
 * `actorId` is null for system reminders. Each recipient is pushed the details over SSE
 * (events go only to that user), so the client can alert without an extra round trip.
 * This is the single delivery point — Web Push can be added here later.
 */
export async function notify(
  recipients: Iterable<number | null | undefined>,
  actorId: number | null,
  taskId: number,
  type: string,
  message: string,
  options: NotifyOptions = {},
): Promise<void> {
  const unique = [...new Set([...recipients].filter((id): id is number => !!id && id !== actorId))];
  if (!unique.length) return;
  const level = options.level ?? 'normal';
  const data = options.data ?? {};
  const rows = await db
    .insert(schema.notifications)
    .values(unique.map((userId) => ({ userId, actorId, taskId, type, message, level, data })))
    .returning({ id: schema.notifications.id, userId: schema.notifications.userId, createdAt: schema.notifications.createdAt });
  for (const r of rows) {
    sendToUser(r.userId, { type: 'notification', notificationId: r.id, taskId, kind: type, level, message, data, createdAt: r.createdAt.toISOString() });
  }
}

/** Marks a user's unread alert notifications for a task as handled (stops client alarms). */
export async function clearAlerts(taskId: number, userId: number | null | undefined): Promise<void> {
  if (!userId) return;
  const n = schema.notifications;
  const cleared = await db
    .update(n)
    .set({ readAt: new Date() })
    .where(and(eq(n.taskId, taskId), eq(n.userId, userId), isNull(n.readAt), inArray(n.type, ALERT_TYPES)))
    .returning({ id: n.id });
  if (cleared.length) sendToUser(userId, { type: 'alerts.cleared', taskId });
}

/** Notification types that represent work waiting on the recipient. */
export const ALERT_TYPES = ['assigned', 'reminder', 'due', 'overdue', 'urgent'];

/** Active members of a section (used for urgent-task alerts). */
export async function sectionMemberIds(sectionId: number): Promise<number[]> {
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.userSections)
    .innerJoin(schema.users, eq(schema.users.id, schema.userSections.userId))
    .where(and(eq(schema.userSections.sectionId, sectionId), eq(schema.users.isActive, true)));
  return rows.map((r) => r.id);
}

export async function adminIds(exceptUserId: number): Promise<number[]> {
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.role, 'admin'), eq(schema.users.isActive, true), ne(schema.users.id, exceptUserId)));
  return rows.map((r) => r.id);
}
