import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { config } from '../config.js';
import { parse, idParam, badRequest, notFound, forbidden } from '../lib/http.js';
import { loadVisibleTask, taskPermissions, assertCan } from '../lib/permissions.js';
import { logActivity, notify, sectionMemberIds, adminIds, clearAlerts } from '../lib/activity.js';
import { alertDetails, sendAssignmentAlert } from '../services/assignment.js';
import { broadcast } from '../lib/events.js';
import { todayISO } from '../lib/dates.js';
import { validateDocument, validateAudio, saveFile, deleteFile, safeFileName } from '../lib/storage.js';
import { getTaskRow, listTasks, withPermissions } from '../services/tasks.js';
import { loadStructureTree, structureChain, structurePath } from '../services/structures.js';

export const tasksRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 10 },
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.');
const csvInts = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(',').map((v) => v.trim()) : []));
const csvEnum = <T extends string>(values: readonly [T, ...T[]]) =>
  z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',') : []))
    .pipe(z.array(z.enum(values)));

const listQuery = z.object({
  view: z.enum(['inbox', 'mine', 'all', 'priority', 'completed']).optional(),
  status: csvEnum(['pending', 'completed']),
  section: csvInts,
  assignee: csvInts,
  priority: csvEnum(['normal', 'high', 'urgent']),
  createdBy: csvInts,
  structure: csvInts,
  action: csvInts,
  stage: csvEnum(['new', 'assigned', 'acknowledged', 'in_progress', 'completed']),
  q: z.string().max(100).optional(),
  createdFrom: isoDate.optional(),
  createdTo: isoDate.optional(),
  dueFrom: isoDate.optional(),
  dueTo: isoDate.optional(),
  closedFrom: isoDate.optional(),
  closedTo: isoDate.optional(),
  due: z.enum(['today', 'upcoming', 'overdue']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

const toIds = (values: string[], meId: number) =>
  values.map((v) => (v === 'me' ? meId : Number(v))).filter((n) => Number.isInteger(n) && n > 0);

const taskFields = {
  title: z.string().trim().min(1, 'Enter what needs to be done.').max(200),
  quantity: z.coerce.number().positive('Quantity must be more than 0.').max(1_000_000),
  unit: z.string().trim().min(1).max(20),
  description: z.string().trim().max(4000).nullable(),
  sectionId: z.number().int().positive().nullable(),
  structureId: z.number().int().positive().nullable(),
  actionId: z.number().int().positive().nullable(),
  assignedTo: z.number().int().positive().nullable(),
  priority: z.enum(['normal', 'high', 'urgent']),
  dueDate: isoDate.nullable(),
};

const createSchema = z.object({
  ...taskFields,
  unit: taskFields.unit.default('Nos'),
  description: taskFields.description.optional(),
  sectionId: taskFields.sectionId.optional(),
  structureId: taskFields.structureId.optional(),
  actionId: taskFields.actionId.optional(),
  assignedTo: taskFields.assignedTo.optional(),
  priority: taskFields.priority.default('normal'),
  dueDate: taskFields.dueDate.optional(),
});

const updateSchema = z.object(taskFields).partial().strict();

async function assertActiveSection(id: number | null | undefined) {
  if (!id) return null;
  const [s] = await db.select().from(schema.sections).where(eq(schema.sections.id, id));
  if (!s || !s.isActive) throw badRequest('Selected section is not available.', { sectionId: 'Choose another section.' });
  return s;
}

async function assertActiveUser(id: number | null | undefined) {
  if (!id) return null;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!u || !u.isActive) throw badRequest('Selected person is not available.', { assignedTo: 'Choose another person.' });
  return u;
}

async function assertActiveStructure(id: number | null | undefined) {
  if (!id) return null;
  // The structure and every structure above it must be active.
  const chain = structureChain(await loadStructureTree(), id);
  if (!chain.length || chain[chain.length - 1].id !== id || chain.some((s) => !s.isActive)) {
    throw badRequest('Selected structure is not available.', { structureId: 'Choose another structure.' });
  }
  return chain[chain.length - 1];
}

async function assertActiveAction(id: number | null | undefined) {
  if (!id) return null;
  const [a] = await db.select().from(schema.taskActions).where(eq(schema.taskActions.id, id));
  if (!a || !a.isActive) throw badRequest('Selected action is not available.', { actionId: 'Choose another action.' });
  return a;
}

async function actionName(id: number | null): Promise<string | null> {
  if (!id) return null;
  const [a] = await db.select({ name: schema.taskActions.name }).from(schema.taskActions).where(eq(schema.taskActions.id, id));
  return a?.name ?? null;
}

/** Fields that start a fresh assignment. Self-assignment counts as acknowledged immediately. */
function assignmentFields(assigneeId: number | null, actorId: number) {
  const now = new Date();
  const self = assigneeId !== null && assigneeId === actorId;
  return {
    assignedAt: assigneeId ? now : null,
    acknowledgedAt: self ? now : null,
    acknowledgedBy: self ? actorId : null,
    startedAt: null,
    reminderCount: 0,
    lastReminderAt: null,
  };
}

async function userName(id: number): Promise<string | null> {
  const [u] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, id));
  return u?.name ?? null;
}

const label = (task: { title: string; quantity: number; unit: string }) =>
  `${task.title} – ${Number(task.quantity)} ${task.unit}`;

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

tasksRouter.get('/', async (req, res) => {
  const q = parse(listQuery, req.query);
  const user = req.user!;
  const result = await listTasks(user, {
    view: q.view,
    status: q.status,
    sectionIds: toIds(q.section, user.id),
    noSection: q.section.includes('none'),
    assignedTo: toIds(q.assignee, user.id),
    unassigned: q.assignee.includes('none'),
    priority: q.priority,
    createdBy: toIds(q.createdBy, user.id),
    structureIds: toIds(q.structure, user.id),
    noStructure: q.structure.includes('none'),
    actionIds: toIds(q.action, user.id),
    noAction: q.action.includes('none'),
    stages: q.stage,
    q: q.q,
    createdFrom: q.createdFrom,
    createdTo: q.createdTo,
    dueFrom: q.dueFrom,
    dueTo: q.dueTo,
    closedFrom: q.closedFrom,
    closedTo: q.closedTo,
    due: q.due,
    today: todayISO(),
    page: q.page,
    pageSize: q.pageSize,
  });
  res.json(result);
});

tasksRouter.post('/', async (req, res) => {
  const user = req.user!;
  const input = parse(createSchema, req.body);
  const section = await assertActiveSection(input.sectionId);
  const assignee = await assertActiveUser(input.assignedTo);
  const structure = await assertActiveStructure(input.structureId);
  const action = await assertActiveAction(input.actionId);

  const [task] = await db
    .insert(schema.purchaseTasks)
    .values({
      title: input.title,
      quantity: input.quantity,
      unit: input.unit,
      description: input.description || null,
      sectionId: section?.id ?? null,
      structureId: structure?.id ?? null,
      actionId: action?.id ?? null,
      assignedTo: assignee?.id ?? null,
      priority: input.priority,
      dueDate: input.dueDate ?? null,
      createdBy: user.id,
      ...assignmentFields(assignee?.id ?? null, user.id),
    })
    .returning();

  await logActivity(task.id, user.id, 'created', {
    title: label(task),
    via: req.get('x-jpm-source') === 'voice' ? 'voice' : 'form',
    action: action?.name ?? null,
    structure: structure ? structurePath(await loadStructureTree(), structure.id) : [],
  });
  if (assignee) {
    await logActivity(task.id, user.id, 'assigned', { to: assignee.id, toName: assignee.name });
    await sendAssignmentAlert(task, assignee.id, user);
  }
  if (task.priority === 'urgent') {
    const recipients = section ? await sectionMemberIds(section.id) : await adminIds(user.id);
    await notify(
      recipients.filter((id) => id !== assignee?.id),
      user.id,
      task.id,
      'urgent',
      `Urgent ${action ? action.name.toLowerCase() : 'task'}: ${label(task)}${section ? ` for ${section.name}` : ''}.`,
    );
  }

  broadcast({ type: 'task.changed', taskId: task.id });
  const row = (await getTaskRow(task.id))!;
  res.status(201).json({ data: withPermissions(user, row) });
});

/**
 * Order several items at once: the shared details (structure, action, section, assignee,
 * priority, due date) are entered once and each item becomes its own task, so every item can be
 * received and closed separately. The assignee gets a single alert for the whole order.
 */
const bulkSchema = z.object({
  items: z
    .array(z.object({ title: taskFields.title, quantity: taskFields.quantity, unit: taskFields.unit.default('Nos') }))
    .min(1, 'Add at least one item.')
    .max(30, 'You can add up to 30 items at a time.'),
  description: taskFields.description.optional(),
  sectionId: taskFields.sectionId.optional(),
  structureId: taskFields.structureId.optional(),
  actionId: taskFields.actionId.optional(),
  assignedTo: taskFields.assignedTo.optional(),
  priority: taskFields.priority.default('normal'),
  dueDate: taskFields.dueDate.optional(),
});

tasksRouter.post('/bulk', async (req, res) => {
  const user = req.user!;
  const input = parse(bulkSchema, req.body);
  const section = await assertActiveSection(input.sectionId);
  const assignee = await assertActiveUser(input.assignedTo);
  const structure = await assertActiveStructure(input.structureId);
  const action = await assertActiveAction(input.actionId);
  const path = structure ? structurePath(await loadStructureTree(), structure.id) : [];

  // All items are created together or not at all.
  const tasks = await db.transaction(async (tx) => {
    const created = await tx
      .insert(schema.purchaseTasks)
      .values(
        input.items.map((item) => ({
          title: item.title,
          quantity: item.quantity,
          unit: item.unit,
          description: input.description || null,
          sectionId: section?.id ?? null,
          structureId: structure?.id ?? null,
          actionId: action?.id ?? null,
          assignedTo: assignee?.id ?? null,
          priority: input.priority,
          dueDate: input.dueDate ?? null,
          createdBy: user.id,
          ...assignmentFields(assignee?.id ?? null, user.id),
        })),
      )
      .returning();
    await tx.insert(schema.activityLogs).values(
      created.flatMap((task) => [
        { taskId: task.id, userId: user.id, action: 'created', metadata: { title: label(task), via: 'form', action: action?.name ?? null, structure: path, batch: created.length } },
        ...(assignee ? [{ taskId: task.id, userId: user.id, action: 'assigned', metadata: { to: assignee.id, toName: assignee.name } }] : []),
      ]),
    );
    return created;
  });

  // One alert for the whole order instead of one per item.
  const first = tasks[0];
  const summary = tasks.length === 1 ? label(first) : `${tasks.length} items: ${tasks.map(label).join(', ')}`;
  const shortSummary = summary.length > 180 ? `${summary.slice(0, 180)}…` : summary;
  if (assignee) {
    if (tasks.length === 1) await sendAssignmentAlert(first, assignee.id, user);
    else {
      await notify([assignee.id], user.id, first.id, 'assigned', `${tasks.length} new tasks assigned to you by ${user.name}`, {
        level: input.priority,
        data: { ...(await alertDetails(first, user.name)), label: shortSummary, count: tasks.length },
      });
    }
  }
  if (input.priority === 'urgent') {
    const recipients = section ? await sectionMemberIds(section.id) : await adminIds(user.id);
    await notify(
      recipients.filter((id) => id !== assignee?.id),
      user.id,
      first.id,
      'urgent',
      `Urgent ${action ? action.name.toLowerCase() : 'task'}: ${shortSummary}${section ? ` for ${section.name}` : ''}.`,
    );
  }

  for (const task of tasks) broadcast({ type: 'task.changed', taskId: task.id });
  const rows = await Promise.all(tasks.map((task) => getTaskRow(task.id)));
  res.status(201).json({ data: rows.map((row) => withPermissions(user, row!)) });
});

tasksRouter.get('/:id', async (req, res) => {
  const user = req.user!;
  const task = await loadVisibleTask(user, idParam(req));
  const row = (await getTaskRow(task.id))!;
  const files = await db
    .select({
      id: schema.attachments.id,
      fileName: schema.attachments.fileName,
      fileType: schema.attachments.fileType,
      fileSize: schema.attachments.fileSize,
      createdAt: schema.attachments.createdAt,
      uploadedBy: schema.attachments.uploadedBy,
      uploaderName: schema.users.name,
    })
    .from(schema.attachments)
    .innerJoin(schema.users, eq(schema.users.id, schema.attachments.uploadedBy))
    .where(eq(schema.attachments.taskId, task.id))
    .orderBy(asc(schema.attachments.createdAt));

  res.json({
    data: {
      ...withPermissions(user, row),
      attachments: files.map((f) => ({
        ...f,
        url: `/api/files/attachments/${f.id}`,
        canDelete: user.role === 'admin' || f.uploadedBy === user.id,
      })),
    },
  });
});

tasksRouter.patch('/:id', async (req, res) => {
  const user = req.user!;
  const task = await loadVisibleTask(user, idParam(req));
  const perms = taskPermissions(user, task);
  const input = parse(updateSchema, req.body);

  const assigning = 'assignedTo' in input && input.assignedTo !== task.assignedTo;
  const editingOther = Object.keys(input).some((k) => k !== 'assignedTo');
  if (assigning) assertCan(perms, 'assign', 'Only an admin or the person who created this task can reassign it.');
  if (editingOther) assertCan(perms, 'edit', 'Only an admin or the person who created this task can edit it.');

  if ('sectionId' in input && input.sectionId !== task.sectionId) await assertActiveSection(input.sectionId);
  const newAssignee = assigning ? await assertActiveUser(input.assignedTo) : null;
  const structureChanging = 'structureId' in input && input.structureId !== task.structureId;
  const actionChanging = 'actionId' in input && input.actionId !== task.actionId;
  if (structureChanging) await assertActiveStructure(input.structureId);
  if (actionChanging) await assertActiveAction(input.actionId);

  const changed = (Object.keys(input) as Array<keyof typeof input>).filter((k) => {
    const before = task[k as keyof typeof task];
    return String(before ?? '') !== String(input[k] ?? '');
  });
  if (!changed.length) {
    res.json({ data: withPermissions(user, (await getTaskRow(task.id))!) });
    return;
  }

  const [updated] = await db
    .update(schema.purchaseTasks)
    .set({
      ...input,
      description: input.description === '' ? null : input.description,
      // A new assignee starts a fresh assignment: acknowledgement, start and reminders reset.
      ...(assigning ? assignmentFields(newAssignee?.id ?? null, user.id) : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.purchaseTasks.id, task.id))
    .returning();

  const specific = ['assignedTo', 'structureId', 'actionId', 'priority', 'dueDate'];
  const otherChanges = changed.filter((k) => !specific.includes(k));
  if (otherChanges.length) await logActivity(task.id, user.id, 'updated', { fields: otherChanges });
  if (changed.includes('priority')) await logActivity(task.id, user.id, 'priority_changed', { from: task.priority, to: updated.priority });
  if (changed.includes('dueDate')) await logActivity(task.id, user.id, 'due_date_changed', { from: task.dueDate, to: updated.dueDate });
  if (structureChanging) {
    const tree = await loadStructureTree();
    await logActivity(task.id, user.id, 'structure_changed', {
      from: structurePath(tree, task.structureId),
      to: structurePath(tree, updated.structureId),
    });
  }
  if (actionChanging) {
    await logActivity(task.id, user.id, 'action_changed', { from: await actionName(task.actionId), to: await actionName(updated.actionId) });
  }
  if (assigning) {
    const previous = task.assignedTo ? await userName(task.assignedTo) : null;
    if (task.assignedTo) {
      await logActivity(task.id, user.id, 'reassigned', {
        from: task.assignedTo,
        fromName: previous,
        to: newAssignee?.id ?? null,
        toName: newAssignee?.name ?? null,
      });
      // The previous assignee's alarms/reminders for this task stop; they get a quiet note.
      await clearAlerts(task.id, task.assignedTo);
      await notify(
        [task.assignedTo],
        user.id,
        task.id,
        'unassigned',
        newAssignee ? `${user.name} reassigned ${label(updated)} to ${newAssignee.name}.` : `${user.name} removed you from ${label(updated)}.`,
      );
    } else {
      await logActivity(task.id, user.id, 'assigned', { to: newAssignee?.id ?? null, toName: newAssignee?.name ?? null });
    }
    if (newAssignee) await sendAssignmentAlert(updated, newAssignee.id, user, !!task.assignedTo);
  }
  if ('priority' in input && input.priority === 'urgent' && task.priority !== 'urgent' && updated.assignedTo && !assigning) {
    await notify([updated.assignedTo], user.id, task.id, 'urgent', `${label(updated)} was marked urgent.`, {
      level: 'urgent',
      data: await alertDetails(updated, user.name),
    });
  }

  broadcast({ type: 'task.changed', taskId: task.id });
  res.json({ data: withPermissions(user, (await getTaskRow(task.id))!) });
});

tasksRouter.delete('/:id', async (req, res) => {
  const user = req.user!;
  const task = await loadVisibleTask(user, idParam(req));
  assertCan(taskPermissions(user, task), 'delete', 'Only an admin can delete tasks.');

  const [files, voices] = await Promise.all([
    db.select({ key: schema.attachments.storageKey }).from(schema.attachments).where(eq(schema.attachments.taskId, task.id)),
    db.select({ key: schema.voiceNotes.storageKey }).from(schema.voiceNotes).where(eq(schema.voiceNotes.taskId, task.id)),
  ]);
  await logActivity(task.id, user.id, 'deleted', { title: label(task) });
  await db.delete(schema.purchaseTasks).where(eq(schema.purchaseTasks.id, task.id));
  await Promise.all([...files, ...voices].map((f) => deleteFile(f.key).catch(() => undefined)));

  broadcast({ type: 'task.deleted', taskId: task.id });
  res.json({ data: { id: task.id } });
});

tasksRouter.post('/:id/close', async (req, res) => {
  const user = req.user!;
  const task = await loadVisibleTask(user, idParam(req));
  if (task.status === 'completed') throw badRequest('This task is already closed.');
  assertCan(taskPermissions(user, task), 'close', 'Only the assigned person or an admin can close this task.');

  const [updated] = await db
    .update(schema.purchaseTasks)
    .set({ status: 'completed', closedAt: new Date(), closedBy: user.id, updatedAt: new Date() })
    .where(and(eq(schema.purchaseTasks.id, task.id), eq(schema.purchaseTasks.status, 'pending')))
    .returning();
  if (!updated) throw badRequest('This task is already closed.');

  await logActivity(task.id, user.id, 'closed');
  await clearAlerts(task.id, task.assignedTo);
  await notify([task.createdBy, task.assignedTo], user.id, task.id, 'closed', `${user.name} closed ${label(task)}.`);
  broadcast({ type: 'task.changed', taskId: task.id });
  res.json({ data: withPermissions(user, (await getTaskRow(task.id))!) });
});

/** Marks every task still waiting on the signed-in user as received (e.g. a multi-item order). */
tasksRouter.post('/acknowledge-all', async (req, res) => {
  const user = req.user!;
  const now = new Date();
  const t = schema.purchaseTasks;
  const updated = await db
    .update(t)
    .set({ acknowledgedAt: now, acknowledgedBy: user.id, updatedAt: now })
    .where(and(eq(t.assignedTo, user.id), eq(t.status, 'pending'), isNull(t.acknowledgedAt)))
    .returning();

  if (updated.length) {
    await db.insert(schema.activityLogs).values(updated.map((task) => ({ taskId: task.id, userId: user.id, action: 'acknowledged', metadata: {} })));
    // One note per requester, not one per task.
    const byCreator = new Map<number, schema.PurchaseTask[]>();
    for (const task of updated) byCreator.set(task.createdBy, [...(byCreator.get(task.createdBy) ?? []), task]);
    for (const [creatorId, tasks] of byCreator) {
      const text = tasks.length === 1 ? `${user.name} received ${label(tasks[0])}.` : `${user.name} received ${tasks.length} tasks.`;
      await notify([creatorId], user.id, tasks[0].id, 'acknowledged', text);
    }
    for (const task of updated) {
      await clearAlerts(task.id, user.id);
      broadcast({ type: 'task.changed', taskId: task.id });
    }
  }
  res.json({ data: { count: updated.length } });
});

/** The assignee confirms they have seen the assignment. Stops alarms and reminders. */
tasksRouter.post('/:id/acknowledge', async (req, res) => {
  const user = req.user!;
  const task = await loadVisibleTask(user, idParam(req));
  if (task.assignedTo !== user.id) throw forbidden('Only the assigned person can mark this task as received.');
  if (task.status !== 'pending') throw badRequest('This task is already closed.');

  const [updated] = await db
    .update(schema.purchaseTasks)
    .set({ acknowledgedAt: new Date(), acknowledgedBy: user.id, updatedAt: new Date() })
    // Conditional on the same assignment, so a concurrent reassignment is not acknowledged by mistake.
    .where(and(eq(schema.purchaseTasks.id, task.id), eq(schema.purchaseTasks.assignedTo, user.id), isNull(schema.purchaseTasks.acknowledgedAt)))
    .returning();
  if (updated) {
    await logActivity(task.id, user.id, 'acknowledged');
    await notify([task.createdBy], user.id, task.id, 'acknowledged', `${user.name} received ${label(task)}.`);
  }
  await clearAlerts(task.id, user.id);
  broadcast({ type: 'task.changed', taskId: task.id });
  res.json({ data: withPermissions(user, (await getTaskRow(task.id))!) });
});

/** Marks work as started (in progress). Starting also acknowledges the assignment. */
tasksRouter.post('/:id/start', async (req, res) => {
  const user = req.user!;
  const task = await loadVisibleTask(user, idParam(req));
  assertCan(taskPermissions(user, task), 'start', 'Only the assigned person or an admin can start this task.');

  const now = new Date();
  const acknowledging = !task.acknowledgedAt && task.assignedTo === user.id;
  await db
    .update(schema.purchaseTasks)
    .set({ startedAt: now, updatedAt: now, ...(acknowledging ? { acknowledgedAt: now, acknowledgedBy: user.id } : {}) })
    .where(eq(schema.purchaseTasks.id, task.id));
  if (acknowledging) {
    await logActivity(task.id, user.id, 'acknowledged');
    await clearAlerts(task.id, user.id);
  }
  await logActivity(task.id, user.id, 'started');
  broadcast({ type: 'task.changed', taskId: task.id });
  res.json({ data: withPermissions(user, (await getTaskRow(task.id))!) });
});

tasksRouter.post('/:id/reopen', async (req, res) => {
  const user = req.user!;
  const task = await loadVisibleTask(user, idParam(req));
  if (task.status === 'pending') throw badRequest('This task is already open.');
  assertCan(taskPermissions(user, task), 'reopen', 'Only an admin can reopen a closed task.');

  await db
    .update(schema.purchaseTasks)
    .set({ status: 'pending', closedAt: null, closedBy: null, updatedAt: new Date() })
    .where(eq(schema.purchaseTasks.id, task.id));

  await logActivity(task.id, user.id, 'reopened');
  await notify([task.assignedTo, task.createdBy], user.id, task.id, 'reopened', `${user.name} reopened ${label(task)}.`);
  broadcast({ type: 'task.changed', taskId: task.id });
  res.json({ data: withPermissions(user, (await getTaskRow(task.id))!) });
});

// ---------------------------------------------------------------------------
// Conversation thread: text comments, voice notes and attachments, in time order.
// ---------------------------------------------------------------------------

async function thread(taskId: number) {
  const [comments, voices, files] = await Promise.all([
    db
      .select({
        id: schema.comments.id,
        userId: schema.comments.userId,
        userName: schema.users.name,
        message: schema.comments.message,
        createdAt: schema.comments.createdAt,
      })
      .from(schema.comments)
      .innerJoin(schema.users, eq(schema.users.id, schema.comments.userId))
      .where(eq(schema.comments.taskId, taskId)),
    db
      .select({
        id: schema.voiceNotes.id,
        userId: schema.voiceNotes.userId,
        userName: schema.users.name,
        duration: schema.voiceNotes.duration,
        createdAt: schema.voiceNotes.createdAt,
      })
      .from(schema.voiceNotes)
      .innerJoin(schema.users, eq(schema.users.id, schema.voiceNotes.userId))
      .where(eq(schema.voiceNotes.taskId, taskId)),
    db
      .select({
        id: schema.attachments.id,
        userId: schema.attachments.uploadedBy,
        userName: schema.users.name,
        fileName: schema.attachments.fileName,
        fileType: schema.attachments.fileType,
        fileSize: schema.attachments.fileSize,
        createdAt: schema.attachments.createdAt,
      })
      .from(schema.attachments)
      .innerJoin(schema.users, eq(schema.users.id, schema.attachments.uploadedBy))
      .where(eq(schema.attachments.taskId, taskId)),
  ]);

  return [
    ...comments.map((c) => ({ kind: 'comment' as const, ...c })),
    ...voices.map((v) => ({ kind: 'voice' as const, ...v, url: `/api/files/voice/${v.id}` })),
    ...files.map((f) => ({ kind: 'attachment' as const, ...f, url: `/api/files/attachments/${f.id}` })),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id);
}

tasksRouter.get('/:id/thread', async (req, res) => {
  const task = await loadVisibleTask(req.user!, idParam(req));
  res.json({ data: await thread(task.id) });
});

tasksRouter.get('/:id/comments', async (req, res) => {
  const task = await loadVisibleTask(req.user!, idParam(req));
  res.json({ data: (await thread(task.id)).filter((i) => i.kind === 'comment') });
});

/** Everyone involved in a task gets told about new messages, except the sender. */
async function participants(task: schema.PurchaseTask): Promise<number[]> {
  const commenters = await db
    .selectDistinct({ id: schema.comments.userId })
    .from(schema.comments)
    .where(eq(schema.comments.taskId, task.id));
  return [task.createdBy, task.assignedTo, ...commenters.map((c) => c.id)].filter((x): x is number => !!x);
}

tasksRouter.post('/:id/comments', async (req, res) => {
  const user = req.user!;
  const task = await loadVisibleTask(user, idParam(req));
  const { message } = parse(z.object({ message: z.string().trim().min(1, 'Type a message.').max(4000) }), req.body);

  const [comment] = await db.insert(schema.comments).values({ taskId: task.id, userId: user.id, message }).returning();
  await logActivity(task.id, user.id, 'commented');
  const preview = message.length > 80 ? `${message.slice(0, 80)}…` : message;
  await notify(await participants(task), user.id, task.id, 'comment', `${user.name} on ${label(task)}: “${preview}”`);
  broadcast({ type: 'task.thread', taskId: task.id });
  res.status(201).json({ data: { kind: 'comment', ...comment, userName: user.name } });
});

tasksRouter.post('/:id/voice', upload.single('audio'), async (req, res) => {
  const user = req.user!;
  const task = await loadVisibleTask(user, idParam(req));
  if (!req.file) throw badRequest('No recording received.');
  const duration = parse(z.coerce.number().int().min(1, 'Recording is too short.').max(600), req.body?.duration);
  const mimeType = await validateAudio(req.file);
  const storageKey = await saveFile(req.file.buffer);

  const [note] = await db
    .insert(schema.voiceNotes)
    .values({ taskId: task.id, userId: user.id, storageKey, mimeType, fileSize: req.file.size, duration })
    .returning({ id: schema.voiceNotes.id, duration: schema.voiceNotes.duration, createdAt: schema.voiceNotes.createdAt });

  await logActivity(task.id, user.id, 'voice_note_added', { duration });
  await notify(await participants(task), user.id, task.id, 'voice', `${user.name} sent a voice note on ${label(task)}.`);
  broadcast({ type: 'task.thread', taskId: task.id });
  res.status(201).json({ data: { kind: 'voice', ...note, userId: user.id, userName: user.name, url: `/api/files/voice/${note.id}` } });
});

tasksRouter.post('/:id/attachments', upload.array('files', 10), async (req, res) => {
  const user = req.user!;
  const task = await loadVisibleTask(user, idParam(req));
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw badRequest('Choose a file to upload.');

  // Validate everything before storing anything.
  const types = await Promise.all(files.map(validateDocument));
  const saved = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const storageKey = await saveFile(file.buffer);
    // Multer decodes multipart file names as latin1.
    const fileName = safeFileName(Buffer.from(file.originalname, 'latin1').toString('utf8'));
    const [row] = await db
      .insert(schema.attachments)
      .values({ taskId: task.id, uploadedBy: user.id, fileName, storageKey, fileType: types[i], fileSize: file.size })
      .returning({ id: schema.attachments.id, fileName: schema.attachments.fileName, fileType: schema.attachments.fileType, fileSize: schema.attachments.fileSize, createdAt: schema.attachments.createdAt });
    saved.push({ ...row, url: `/api/files/attachments/${row.id}`, uploadedBy: user.id, uploaderName: user.name, canDelete: true });
    await logActivity(task.id, user.id, 'attachment_added', { fileName });
  }

  broadcast({ type: 'task.thread', taskId: task.id });
  broadcast({ type: 'task.changed', taskId: task.id });
  res.status(201).json({ data: saved });
});

tasksRouter.delete('/:id/attachments/:attachmentId', async (req, res) => {
  const user = req.user!;
  const task = await loadVisibleTask(user, idParam(req));
  const [file] = await db
    .select()
    .from(schema.attachments)
    .where(and(eq(schema.attachments.id, idParam(req, 'attachmentId')), eq(schema.attachments.taskId, task.id)));
  if (!file) throw notFound('Attachment');
  if (user.role !== 'admin' && file.uploadedBy !== user.id) throw forbidden('You can only delete files you uploaded.');

  await db.delete(schema.attachments).where(eq(schema.attachments.id, file.id));
  await deleteFile(file.storageKey).catch(() => undefined);
  await logActivity(task.id, user.id, 'attachment_deleted', { fileName: file.fileName });
  broadcast({ type: 'task.thread', taskId: task.id });
  broadcast({ type: 'task.changed', taskId: task.id });
  res.json({ data: { id: file.id } });
});

// ---------------------------------------------------------------------------
// Activity history
// ---------------------------------------------------------------------------

tasksRouter.get('/:id/activity', async (req, res) => {
  const task = await loadVisibleTask(req.user!, idParam(req));
  const rows = await db
    .select({
      id: schema.activityLogs.id,
      action: schema.activityLogs.action,
      metadata: schema.activityLogs.metadata,
      createdAt: schema.activityLogs.createdAt,
      userId: schema.activityLogs.userId,
      userName: schema.users.name,
    })
    .from(schema.activityLogs)
    .leftJoin(schema.users, eq(schema.users.id, schema.activityLogs.userId))
    .where(eq(schema.activityLogs.taskId, task.id))
    .orderBy(desc(schema.activityLogs.createdAt), desc(schema.activityLogs.id));
  res.json({ data: rows });
});
