import { and, eq, inArray, or, type SQL } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import type { AuthUser } from './auth.js';
import { forbidden, notFound } from './http.js';

/**
 * All task-level authorisation lives here so that rules can be made configurable later.
 *
 * Visibility for normal users: tasks they created, tasks assigned to them,
 * and tasks in sections they are a member of. Admins see everything.
 */
type TaskRef = Pick<schema.PurchaseTask, 'id' | 'createdBy' | 'assignedTo' | 'sectionId' | 'status'>;

const isAdmin = (u: AuthUser) => u.role === 'admin';

export function visibleTasksCondition(user: AuthUser): SQL | undefined {
  if (isAdmin(user)) return undefined;
  const t = schema.purchaseTasks;
  const memberSections = db
    .select({ id: schema.userSections.sectionId })
    .from(schema.userSections)
    .where(eq(schema.userSections.userId, user.id));
  return or(eq(t.createdBy, user.id), eq(t.assignedTo, user.id), inArray(t.sectionId, memberSections));
}

export async function userSectionIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ id: schema.userSections.sectionId })
    .from(schema.userSections)
    .where(eq(schema.userSections.userId, userId));
  return rows.map((r) => r.id);
}

/**
 * Loads a task the user is allowed to see. Unauthorised access returns 404 (not 403) so task IDs cannot be probed.
 */
export async function loadVisibleTask(user: AuthUser, taskId: number): Promise<schema.PurchaseTask> {
  const [task] = await db
    .select()
    .from(schema.purchaseTasks)
    .where(and(eq(schema.purchaseTasks.id, taskId), visibleTasksCondition(user)));
  if (!task) throw notFound('Task');
  return task;
}

export function taskPermissions(user: AuthUser, task: TaskRef) {
  const admin = isAdmin(user);
  const creator = task.createdBy === user.id;
  const assignee = task.assignedTo === user.id;
  return {
    edit: admin || (creator && task.status === 'pending'),
    assign: admin || (creator && task.status === 'pending'),
    close: task.status === 'pending' && (admin || assignee),
    reopen: task.status === 'completed' && admin,
    delete: admin,
    comment: true,
  };
}

export type TaskPermissions = ReturnType<typeof taskPermissions>;

export function assertCan(perms: TaskPermissions, action: keyof TaskPermissions, message?: string): void {
  if (!perms[action]) throw forbidden(message);
}
