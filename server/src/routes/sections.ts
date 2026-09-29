import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { parse, idParam, badRequest, notFound } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';
import { visibleTasksCondition } from '../lib/permissions.js';
import { broadcast } from '../lib/events.js';

export const sectionsRouter = Router();

const t = schema.purchaseTasks;

sectionsRouter.get('/', async (req, res) => {
  const user = req.user!;
  const includeInactive = req.query.all === '1' && user.role === 'admin';
  const visible = visibleTasksCondition(user);
  const pendingCount = db
    .select({ sectionId: t.sectionId, count: sql<number>`count(*)::int`.as('pending_count') })
    .from(t)
    .where(and(eq(t.status, 'pending'), visible))
    .groupBy(t.sectionId)
    .as('pc');

  const rows = await db
    .select({
      id: schema.sections.id,
      name: schema.sections.name,
      description: schema.sections.description,
      icon: schema.sections.icon,
      isActive: schema.sections.isActive,
      sortOrder: schema.sections.sortOrder,
      pendingCount: sql<number>`coalesce(${pendingCount.count}, 0)::int`,
    })
    .from(schema.sections)
    .leftJoin(pendingCount, eq(pendingCount.sectionId, schema.sections.id))
    .where(includeInactive ? undefined : eq(schema.sections.isActive, true))
    .orderBy(asc(schema.sections.sortOrder), asc(schema.sections.name));
  res.json({ data: rows });
});

const sectionInput = z.object({
  name: z.string().trim().min(1, 'Enter a section name.').max(80),
  description: z.string().trim().max(500).nullable().optional(),
  icon: z.string().trim().max(40).nullable().optional(),
  isActive: z.boolean().optional(),
});

async function assertUniqueName(name: string, exceptId?: number) {
  const [dup] = await db
    .select({ id: schema.sections.id })
    .from(schema.sections)
    .where(and(eq(sql`lower(${schema.sections.name})`, name.toLowerCase()), exceptId ? ne(schema.sections.id, exceptId) : undefined));
  if (dup) throw badRequest('A section with this name already exists.', { name: 'Name already used.' });
}

sectionsRouter.post('/', requireAdmin, async (req, res) => {
  const input = parse(sectionInput, req.body);
  await assertUniqueName(input.name);
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${schema.sections.sortOrder}), 0)::int` }).from(schema.sections);
  const [section] = await db
    .insert(schema.sections)
    .values({ name: input.name, description: input.description ?? null, icon: input.icon ?? null, sortOrder: max + 1 })
    .returning();
  broadcast({ type: 'sections.changed' });
  res.status(201).json({ data: { ...section, pendingCount: 0 } });
});

sectionsRouter.post('/reorder', requireAdmin, async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) }), req.body);
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx.update(schema.sections).set({ sortOrder: i + 1, updatedAt: new Date() }).where(eq(schema.sections.id, ids[i]));
    }
  });
  broadcast({ type: 'sections.changed' });
  res.json({ data: { ok: true } });
});

sectionsRouter.patch('/:id', requireAdmin, async (req, res) => {
  const id = idParam(req);
  const input = parse(sectionInput.partial().strict(), req.body);
  if (input.name) await assertUniqueName(input.name, id);
  const [section] = await db
    .update(schema.sections)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(schema.sections.id, id))
    .returning();
  if (!section) throw notFound('Section');
  broadcast({ type: 'sections.changed' });
  res.json({ data: section });
});
