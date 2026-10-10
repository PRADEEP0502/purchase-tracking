import { and, asc, desc, eq, exists, gte, ilike, inArray, isNotNull, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, schema } from '../db/client.js';
import type { AuthUser } from '../lib/auth.js';
import { taskPermissions, visibleTasksCondition } from '../lib/permissions.js';
import { dayEnd, dayStart } from '../lib/dates.js';
import { loadStructureTree, structureContext, withDescendants, type StructureTree } from './structures.js';

const t = schema.purchaseTasks;
const assignee = alias(schema.users, 'assignee');
const creator = alias(schema.users, 'creator');
const closer = alias(schema.users, 'closer');
const acknowledger = alias(schema.users, 'acknowledger');

const countOf = (table: typeof schema.attachments | typeof schema.comments | typeof schema.voiceNotes) =>
  sql<number>`(select count(*)::int from ${table} where ${table.taskId} = ${t.id})`;

export const taskSelection = {
  id: t.id,
  title: t.title,
  quantity: t.quantity,
  unit: t.unit,
  description: t.description,
  priority: t.priority,
  status: t.status,
  dueDate: t.dueDate,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
  closedAt: t.closedAt,
  sectionId: t.sectionId,
  sectionName: schema.sections.name,
  structureId: t.structureId,
  structureName: schema.taskStructures.name,
  actionId: t.actionId,
  actionName: schema.taskActions.name,
  assignedTo: t.assignedTo,
  assigneeName: assignee.name,
  createdBy: t.createdBy,
  creatorName: creator.name,
  closedBy: t.closedBy,
  closerName: closer.name,
  assignedAt: t.assignedAt,
  acknowledgedAt: t.acknowledgedAt,
  acknowledgedBy: t.acknowledgedBy,
  acknowledgedByName: acknowledger.name,
  startedAt: t.startedAt,
  attachmentCount: countOf(schema.attachments),
  commentCount: countOf(schema.comments),
  voiceNoteCount: countOf(schema.voiceNotes),
};

function baseQuery() {
  return db
    .select(taskSelection)
    .from(t)
    .leftJoin(schema.sections, eq(schema.sections.id, t.sectionId))
    .leftJoin(schema.taskStructures, eq(schema.taskStructures.id, t.structureId))
    .leftJoin(schema.taskActions, eq(schema.taskActions.id, t.actionId))
    .leftJoin(assignee, eq(assignee.id, t.assignedTo))
    .leftJoin(creator, eq(creator.id, t.createdBy))
    .leftJoin(closer, eq(closer.id, t.closedBy))
    .leftJoin(acknowledger, eq(acknowledger.id, t.acknowledgedBy));
}

export type TaskStage = 'new' | 'assigned' | 'acknowledged' | 'in_progress' | 'completed';

/** Work stage derived from the open/closed status plus the assignment timestamps. */
export function taskStage(row: Pick<BaseRow, 'status' | 'assignedTo' | 'acknowledgedAt' | 'startedAt'>): TaskStage {
  if (row.status === 'completed') return 'completed';
  if (row.startedAt) return 'in_progress';
  if (row.acknowledgedAt) return 'acknowledged';
  return row.assignedTo ? 'assigned' : 'new';
}

type BaseRow = Awaited<ReturnType<typeof baseQuery>>[number];
export type TaskRow = BaseRow & ReturnType<typeof structureContext>;

const withContext = (tree: StructureTree, row: BaseRow): TaskRow => ({ ...row, ...structureContext(tree, row.structureId) });

export function withPermissions(user: AuthUser, row: TaskRow) {
  return { ...row, stage: taskStage(row), permissions: taskPermissions(user, row) };
}

export async function getTaskRow(id: number): Promise<TaskRow | undefined> {
  const [[row], tree] = await Promise.all([baseQuery().where(eq(t.id, id)), loadStructureTree()]);
  return row ? withContext(tree, row) : undefined;
}

export interface TaskFilters {
  view?: 'inbox' | 'mine' | 'all' | 'priority' | 'completed';
  status?: Array<'pending' | 'completed'>;
  sectionIds?: number[];
  noSection?: boolean;
  assignedTo?: number[];
  unassigned?: boolean;
  priority?: Array<'normal' | 'high' | 'urgent'>;
  createdBy?: number[];
  /** Matches tasks on these structures or anywhere below them. */
  structureIds?: number[];
  noStructure?: boolean;
  actionIds?: number[];
  noAction?: boolean;
  stages?: TaskStage[];
  q?: string;
  createdFrom?: string;
  createdTo?: string;
  dueFrom?: string;
  dueTo?: string;
  closedFrom?: string;
  closedTo?: string;
  /** For My Tasks tabs. */
  due?: 'today' | 'upcoming' | 'overdue';
  today: string;
  page: number;
  pageSize: number;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);


export async function listTasks(user: AuthUser, f: TaskFilters) {
  const tree = await loadStructureTree();
  const where: Array<SQL | undefined> = [visibleTasksCondition(user)];

  switch (f.view) {
    case 'inbox':
      where.push(eq(t.status, 'pending'), or(isNull(t.sectionId), isNull(t.assignedTo)));
      break;
    case 'mine':
      where.push(eq(t.assignedTo, user.id));
      break;
    case 'priority':
      where.push(eq(t.status, 'pending'), inArray(t.priority, ['high', 'urgent']));
      break;
    case 'completed':
      where.push(eq(t.status, 'completed'));
      break;
  }

  if (f.status?.length) where.push(inArray(t.status, f.status));
  if (f.sectionIds?.length || f.noSection) {
    where.push(or(f.sectionIds?.length ? inArray(t.sectionId, f.sectionIds) : undefined, f.noSection ? isNull(t.sectionId) : undefined));
  }
  if (f.assignedTo?.length || f.unassigned) {
    where.push(or(f.assignedTo?.length ? inArray(t.assignedTo, f.assignedTo) : undefined, f.unassigned ? isNull(t.assignedTo) : undefined));
  }
  if (f.priority?.length) where.push(inArray(t.priority, f.priority));
  if (f.createdBy?.length) where.push(inArray(t.createdBy, f.createdBy));
  if (f.structureIds?.length || f.noStructure) {
    where.push(
      or(
        f.structureIds?.length ? inArray(t.structureId, withDescendants(tree, f.structureIds)) : undefined,
        f.noStructure ? isNull(t.structureId) : undefined,
      ),
    );
  }
  if (f.stages?.length) {
    const byStage: Record<TaskStage, SQL | undefined> = {
      new: and(eq(t.status, 'pending'), isNull(t.assignedTo)),
      assigned: and(eq(t.status, 'pending'), isNotNull(t.assignedTo), isNull(t.acknowledgedAt), isNull(t.startedAt)),
      acknowledged: and(eq(t.status, 'pending'), isNotNull(t.acknowledgedAt), isNull(t.startedAt)),
      in_progress: and(eq(t.status, 'pending'), isNotNull(t.startedAt)),
      completed: eq(t.status, 'completed'),
    };
    where.push(or(...f.stages.map((s) => byStage[s])));
  }
  if (f.actionIds?.length || f.noAction) {
    where.push(or(f.actionIds?.length ? inArray(t.actionId, f.actionIds) : undefined, f.noAction ? isNull(t.actionId) : undefined));
  }
  // "From"/"to" dates are inclusive whole days in the business timezone.
  if (f.createdFrom) where.push(gte(t.createdAt, dayStart(f.createdFrom)));
  if (f.createdTo) where.push(lt(t.createdAt, dayEnd(f.createdTo)));
  if (f.dueFrom) where.push(gte(t.dueDate, f.dueFrom));
  if (f.dueTo) where.push(lte(t.dueDate, f.dueTo));
  if (f.closedFrom) where.push(gte(t.closedAt, dayStart(f.closedFrom)));
  if (f.closedTo) where.push(lt(t.closedAt, dayEnd(f.closedTo)));

  if (f.due === 'today') {
    // Today = due today or overdue, still pending.
    where.push(eq(t.status, 'pending'), lte(t.dueDate, f.today));
  } else if (f.due === 'upcoming') {
    where.push(eq(t.status, 'pending'), sql`${t.dueDate} > ${f.today}`);
  } else if (f.due === 'overdue') {
    where.push(eq(t.status, 'pending'), lt(t.dueDate, f.today));
  }

  const q = f.q?.trim();
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    // A structure match also finds tasks filed under its children ("parent structure" search).
    const needle = q.toLowerCase();
    const structureHits = withDescendants(
      tree,
      tree.rows.filter((s) => s.name.toLowerCase().includes(needle)).map((s) => s.id),
    );
    where.push(
      or(
        ilike(t.title, pattern),
        ilike(t.description, pattern),
        ilike(schema.sections.name, pattern),
        ilike(schema.taskActions.name, pattern),
        structureHits.length ? inArray(t.structureId, structureHits) : undefined,
        ilike(assignee.name, pattern),
        ilike(creator.name, pattern),
        exists(
          db
            .select({ one: sql`1` })
            .from(schema.comments)
            .where(and(eq(schema.comments.taskId, t.id), ilike(schema.comments.message, pattern))),
        ),
      ),
    );
  }

  const condition = and(...where);
  const completedFirst = f.view === 'completed' || (f.status?.length === 1 && f.status[0] === 'completed');
  const order = completedFirst
    ? [desc(t.closedAt), desc(t.id)]
    : [
        asc(t.status),
        sql`case ${t.priority} when 'urgent' then 0 when 'high' then 1 else 2 end`,
        sql`${t.dueDate} asc nulls last`,
        desc(t.createdAt),
        desc(t.id),
      ];

  const offset = (f.page - 1) * f.pageSize;
  const [rows, [{ total }]] = await Promise.all([
    baseQuery()
      .where(condition)
      .orderBy(...order)
      .limit(f.pageSize)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(t)
      .leftJoin(schema.sections, eq(schema.sections.id, t.sectionId))
      .leftJoin(schema.taskActions, eq(schema.taskActions.id, t.actionId))
      .leftJoin(assignee, eq(assignee.id, t.assignedTo))
      .leftJoin(creator, eq(creator.id, t.createdBy))
      .where(condition),
  ]);

  return {
    data: rows.map((r) => withPermissions(user, withContext(tree, r))),
    meta: { total, page: f.page, pageSize: f.pageSize, hasMore: offset + rows.length < total },
  };
}
