import { and, eq, ne } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { sendToUser } from './events.js';

export type ActivityAction =
  | 'created'
  | 'updated'
  | 'assigned'
  | 'closed'
  | 'reopened'
  | 'commented'
  | 'voice_note_added'
  | 'attachment_added'
  | 'attachment_deleted'
  | 'deleted';

export async function logActivity(
  taskId: number | null,
  userId: number,
  action: ActivityAction,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(schema.activityLogs).values({ taskId, userId, action, metadata });
}

/**
 * In-app notifications. Kept deliberately sparse: assignment, closure of your request,
 * urgent tasks in your sections, and replies on tasks you are involved in.
 */
export async function notify(
  recipients: Iterable<number | null | undefined>,
  actorId: number,
  taskId: number,
  type: string,
  message: string,
): Promise<void> {
  const unique = [...new Set([...recipients].filter((id): id is number => !!id && id !== actorId))];
  if (!unique.length) return;
  const rows = await db
    .insert(schema.notifications)
    .values(unique.map((userId) => ({ userId, actorId, taskId, type, message })))
    .returning({ id: schema.notifications.id, userId: schema.notifications.userId });
  for (const r of rows) sendToUser(r.userId, { type: 'notification', notificationId: r.id });
}

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
