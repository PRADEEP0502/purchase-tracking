import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { notify, type AlertLevel } from '../lib/activity.js';
import { loadStructureTree, structurePath } from './structures.js';

/**
 * Builds the structured details shown in assignment alerts and reminders:
 * task title, structure path, action, priority, who assigned it and the due date.
 */
export async function alertDetails(task: schema.PurchaseTask, assignedByName: string | null) {
  const [action] = task.actionId
    ? await db.select({ name: schema.taskActions.name }).from(schema.taskActions).where(eq(schema.taskActions.id, task.actionId))
    : [];
  return {
    title: task.title,
    label: taskLabel(task),
    structurePath: structurePath(await loadStructureTree(), task.structureId),
    action: action?.name ?? null,
    priority: task.priority,
    assignedBy: assignedByName,
    dueDate: task.dueDate,
  };
}

export const taskLabel = (task: { title: string; quantity: number; unit: string }) => `${task.title} – ${Number(task.quantity)} ${task.unit}`;

/** Priority maps directly to how loudly the client alerts. */
export const levelFor = (priority: schema.PurchaseTask['priority']): AlertLevel => priority;

/** Sends the "New task assigned" alert to the assignee. */
export async function sendAssignmentAlert(task: schema.PurchaseTask, assigneeId: number, actor: { id: number; name: string }, reassigned = false) {
  const data = await alertDetails(task, actor.name);
  await notify([assigneeId], actor.id, task.id, 'assigned', reassigned ? `Task reassigned to you by ${actor.name}` : `New task assigned to you by ${actor.name}`, {
    level: levelFor(task.priority),
    data,
  });
}
