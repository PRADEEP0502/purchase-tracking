import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { parse, idParam, badRequest, notFound, HttpError } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';
import { broadcast } from '../lib/events.js';
import { loadStructureTree, structureChain, withDescendants } from '../services/structures.js';

/**
 * Admin-managed lookup lists that give tasks their context: the generic structure
 * hierarchy and the list of actions. Everyone can read active values; only admins change them.
 */

const inUse = (what: string) => new HttpError(409, 'in_use', `This ${what} is in use. Disable it instead of deleting.`);
const changed = () => broadcast({ type: 'catalog.changed' });

// ---------------------------------------------------------------------------
// Structures
// ---------------------------------------------------------------------------

export const structuresRouter = Router();
const st = schema.taskStructures;

structuresRouter.get('/', async (req, res) => {
  const includeInactive = req.query.all === '1' && req.user!.role === 'admin';
  const [tree, counts] = await Promise.all([
    loadStructureTree(),
    db
      .select({ id: schema.purchaseTasks.structureId, count: sql<number>`count(*)::int` })
      .from(schema.purchaseTasks)
      .groupBy(schema.purchaseTasks.structureId),
  ]);
  const taskCount = new Map(counts.map((c) => [c.id, c.count]));
  const rows = tree.rows
    // A structure is only selectable when it and all of its ancestors are active.
    .filter((s) => includeInactive || structureChain(tree, s.id).every((a) => a.isActive))
    .map((s) => ({
      id: s.id,
      name: s.name,
      parentId: s.parentId,
      isActive: s.isActive,
      sortOrder: s.sortOrder,
      taskCount: taskCount.get(s.id) ?? 0,
      childCount: tree.children.get(s.id)?.length ?? 0,
    }));
  res.json({ data: rows });
});

const structureName = z.string().trim().min(1, 'Enter a name.').max(120);

async function assertUniqueSibling(name: string, parentId: number | null, exceptId?: number) {
  const [dup] = await db
    .select({ id: st.id })
    .from(st)
    .where(
      and(
        parentId ? eq(st.parentId, parentId) : isNull(st.parentId),
        eq(sql`lower(${st.name})`, name.toLowerCase()),
        exceptId ? ne(st.id, exceptId) : undefined,
      ),
    );
  if (dup) throw badRequest('A structure with this name already exists at this level.', { name: 'Name already used here.' });
}

structuresRouter.post('/', requireAdmin, async (req, res) => {
  const input = parse(z.object({ name: structureName, parentId: z.number().int().positive().nullable().optional() }), req.body);
  const parentId = input.parentId ?? null;
  if (parentId) {
    const [parent] = await db.select({ id: st.id }).from(st).where(eq(st.id, parentId));
    if (!parent) throw badRequest('Parent structure not found.');
  }
  await assertUniqueSibling(input.name, parentId);
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${st.sortOrder}), 0)::int` })
    .from(st)
    .where(parentId ? eq(st.parentId, parentId) : isNull(st.parentId));
  const [row] = await db.insert(st).values({ name: input.name, parentId, sortOrder: max + 1 }).returning();
  changed();
  res.status(201).json({ data: { ...row, taskCount: 0, childCount: 0 } });
});

structuresRouter.post('/reorder', requireAdmin, async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.number().int().positive()).min(1).max(1000) }), req.body);
  const tree = await loadStructureTree();
  const parents = new Set(ids.map((id) => tree.byId.get(id)?.parentId));
  if (ids.some((id) => !tree.byId.has(id)) || parents.size !== 1) throw badRequest('Only structures at the same level can be reordered together.');
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx.update(st).set({ sortOrder: i + 1, updatedAt: new Date() }).where(eq(st.id, ids[i]));
    }
  });
  changed();
  res.json({ data: { ok: true } });
});

structuresRouter.patch('/:id', requireAdmin, async (req, res) => {
  const id = idParam(req);
  const input = parse(
    z
      .object({
        name: structureName,
        parentId: z.number().int().positive().nullable(),
        isActive: z.boolean(),
        sortOrder: z.number().int().min(0).max(1_000_000),
      })
      .partial()
      .strict(),
    req.body,
  );
  const tree = await loadStructureTree();
  const current = tree.byId.get(id);
  if (!current) throw notFound('Structure');

  const parentId = input.parentId !== undefined ? input.parentId : current.parentId;
  if (input.parentId !== undefined && input.parentId !== current.parentId) {
    if (input.parentId && !tree.byId.has(input.parentId)) throw badRequest('Parent structure not found.');
    // Moving a structure under itself or one of its own children would create a loop.
    if (input.parentId && withDescendants(tree, [id]).includes(input.parentId)) {
      throw badRequest('A structure cannot be moved under itself or its own child.');
    }
  }
  if (input.name || input.parentId !== undefined) await assertUniqueSibling(input.name ?? current.name, parentId, id);

  const [row] = await db
    .update(st)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(st.id, id))
    .returning();
  changed();
  // Renaming changes how existing tasks display their context.
  broadcast({ type: 'task.changed', taskId: 0 });
  res.json({ data: row });
});

structuresRouter.delete('/:id', requireAdmin, async (req, res) => {
  const id = idParam(req);
  const [row] = await db.select({ id: st.id }).from(st).where(eq(st.id, id));
  if (!row) throw notFound('Structure');
  const [[child], [task]] = await Promise.all([
    db.select({ id: st.id }).from(st).where(eq(st.parentId, id)).limit(1),
    db.select({ id: schema.purchaseTasks.id }).from(schema.purchaseTasks).where(eq(schema.purchaseTasks.structureId, id)).limit(1),
  ]);
  if (child || task) throw inUse('structure');
  await db.delete(st).where(eq(st.id, id));
  changed();
  res.json({ data: { id } });
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const actionsRouter = Router();
const ac = schema.taskActions;

actionsRouter.get('/', async (req, res) => {
  const includeInactive = req.query.all === '1' && req.user!.role === 'admin';
  const rows = await db
    .select({
      id: ac.id,
      name: ac.name,
      isActive: ac.isActive,
      sortOrder: ac.sortOrder,
      taskCount: sql<number>`count(${schema.purchaseTasks.id})::int`,
    })
    .from(ac)
    .leftJoin(schema.purchaseTasks, eq(schema.purchaseTasks.actionId, ac.id))
    .where(includeInactive ? undefined : eq(ac.isActive, true))
    .groupBy(ac.id)
    .orderBy(asc(ac.sortOrder), asc(ac.name));
  res.json({ data: rows });
});

const actionName = z.string().trim().min(1, 'Enter an action name.').max(60);

async function assertUniqueAction(name: string, exceptId?: number) {
  const [dup] = await db
    .select({ id: ac.id })
    .from(ac)
    .where(and(eq(sql`lower(${ac.name})`, name.toLowerCase()), exceptId ? ne(ac.id, exceptId) : undefined));
  if (dup) throw badRequest('An action with this name already exists.', { name: 'Name already used.' });
}

actionsRouter.post('/', requireAdmin, async (req, res) => {
  const { name } = parse(z.object({ name: actionName }), req.body);
  await assertUniqueAction(name);
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${ac.sortOrder}), 0)::int` }).from(ac);
  const [row] = await db.insert(ac).values({ name, sortOrder: max + 1 }).returning();
  changed();
  res.status(201).json({ data: { ...row, taskCount: 0 } });
});

actionsRouter.post('/reorder', requireAdmin, async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) }), req.body);
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx.update(ac).set({ sortOrder: i + 1, updatedAt: new Date() }).where(eq(ac.id, ids[i]));
    }
  });
  changed();
  res.json({ data: { ok: true } });
});

actionsRouter.patch('/:id', requireAdmin, async (req, res) => {
  const id = idParam(req);
  const input = parse(
    z.object({ name: actionName, isActive: z.boolean(), sortOrder: z.number().int().min(0).max(1_000_000) }).partial().strict(),
    req.body,
  );
  if (input.name) await assertUniqueAction(input.name, id);
  const [row] = await db
    .update(ac)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(ac.id, id))
    .returning();
  if (!row) throw notFound('Action');
  changed();
  broadcast({ type: 'task.changed', taskId: 0 });
  res.json({ data: row });
});

actionsRouter.delete('/:id', requireAdmin, async (req, res) => {
  const id = idParam(req);
  const [row] = await db.select({ id: ac.id }).from(ac).where(eq(ac.id, id));
  if (!row) throw notFound('Action');
  const [task] = await db.select({ id: schema.purchaseTasks.id }).from(schema.purchaseTasks).where(eq(schema.purchaseTasks.actionId, id)).limit(1);
  if (task) throw inUse('action');
  await db.delete(ac).where(eq(ac.id, id));
  changed();
  res.json({ data: { id } });
});
