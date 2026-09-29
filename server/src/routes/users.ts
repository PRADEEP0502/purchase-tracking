import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { parse, idParam, badRequest, notFound } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';

export const usersRouter = Router();

/** Everyone can list active users (needed to assign tasks). Admins can include inactive users and see membership. */
usersRouter.get('/', async (req, res) => {
  const admin = req.user!.role === 'admin';
  const includeInactive = admin && req.query.all === '1';
  const rows = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      role: schema.users.role,
      isActive: schema.users.isActive,
      email: schema.users.email,
      phone: schema.users.phone,
      sectionIds: sql<number[]>`coalesce((select array_agg(${schema.userSections.sectionId}) from ${schema.userSections} where ${schema.userSections.userId} = ${schema.users.id}), '{}')`,
    })
    .from(schema.users)
    .where(includeInactive ? undefined : eq(schema.users.isActive, true))
    .orderBy(asc(schema.users.name));

  res.json({
    data: rows.map((u) =>
      admin ? u : { id: u.id, name: u.name, role: u.role, isActive: u.isActive, sectionIds: u.sectionIds },
    ),
  });
});

const baseUser = {
  name: z.string().trim().min(1, 'Enter a name.').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email.').max(200),
  phone: z.string().trim().max(30).nullable().optional(),
  role: z.enum(['admin', 'user']),
  sectionIds: z.array(z.number().int().positive()).max(200).optional(),
};

async function assertUniqueEmail(email: string, exceptId?: number) {
  const [dup] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(sql`lower(${schema.users.email})`, email.toLowerCase()), exceptId ? ne(schema.users.id, exceptId) : undefined));
  if (dup) throw badRequest('This email is already used by another user.', { email: 'Email already used.' });
}

async function setSections(userId: number, sectionIds: number[] | undefined) {
  if (!sectionIds) return;
  await db.transaction(async (tx) => {
    await tx.delete(schema.userSections).where(eq(schema.userSections.userId, userId));
    if (sectionIds.length) {
      await tx.insert(schema.userSections).values([...new Set(sectionIds)].map((sectionId) => ({ userId, sectionId })));
    }
  });
}

usersRouter.post('/', requireAdmin, async (req, res) => {
  const input = parse(
    z.object({ ...baseUser, password: z.string().min(8, 'Password must be at least 8 characters.').max(200) }),
    req.body,
  );
  await assertUniqueEmail(input.email);
  const [user] = await db
    .insert(schema.users)
    .values({
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      role: input.role,
      passwordHash: await bcrypt.hash(input.password, 10),
    })
    .returning({ id: schema.users.id });
  await setSections(user.id, input.sectionIds);
  res.status(201).json({ data: { id: user.id } });
});

usersRouter.patch('/:id', requireAdmin, async (req, res) => {
  const id = idParam(req);
  const input = parse(
    z
      .object({
        ...baseUser,
        isActive: z.boolean(),
        password: z.string().min(8, 'Password must be at least 8 characters.').max(200),
      })
      .partial()
      .strict(),
    req.body,
  );
  if (id === req.user!.id && (input.isActive === false || input.role === 'user')) {
    throw badRequest('You cannot deactivate or remove admin access from your own account.');
  }
  if (input.email) await assertUniqueEmail(input.email, id);

  const { password, sectionIds, ...fields } = input;
  const [user] = await db
    .update(schema.users)
    .set({ ...fields, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}), updatedAt: new Date() })
    .where(eq(schema.users.id, id))
    .returning({ id: schema.users.id });
  if (!user) throw notFound('User');
  await setSections(id, sectionIds);
  res.json({ data: { id } });
});
