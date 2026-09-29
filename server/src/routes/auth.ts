import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { parse, HttpError, badRequest } from '../lib/http.js';
import { config } from '../config.js';
import { clearSessionCookie, requireAuth, setSessionCookie } from '../lib/auth.js';
import { userSectionIds } from '../lib/permissions.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: { code: 'rate_limited', message: 'Too many sign-in attempts. Please wait a few minutes.' } });
  },
});

// Constant-time-ish response for unknown emails.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = parse(
    z.object({ email: z.string().trim().min(1, 'Enter your email.').max(200), password: z.string().min(1, 'Enter your password.').max(200) }),
    req.body,
  );
  const [user] = await db.select().from(schema.users).where(eq(sql`lower(${schema.users.email})`, email.toLowerCase()));
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.isActive) {
    throw new HttpError(401, 'invalid_credentials', 'Email or password is incorrect.');
  }
  setSessionCookie(res, user.id);
  res.json({ data: await profile(user.id) });
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ data: { ok: true } });
});

async function profile(userId: number) {
  const [u] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      phone: schema.users.phone,
      role: schema.users.role,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return { ...u, sectionIds: await userSectionIds(userId) };
}

/** Returns the signed-in user, or null when there is no valid session (not an error for the login screen). */
authRouter.get('/me', async (req, res, next) => {
  if (!req.cookies?.[config.cookieName]) {
    res.json({ data: null });
    return;
  }
  try {
    await requireAuth(req, res, () => undefined);
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) {
      clearSessionCookie(res);
      res.json({ data: null });
      return;
    }
    return next(e);
  }
  res.json({ data: await profile(req.user!.id) });
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  const input = parse(
    z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        phone: z.string().trim().max(30).nullable().optional(),
        currentPassword: z.string().max(200).optional(),
        newPassword: z.string().min(8, 'New password must be at least 8 characters.').max(200).optional(),
      })
      .strict(),
    req.body,
  );
  const update: Partial<typeof schema.users.$inferInsert> = { updatedAt: new Date() };
  if (input.name) update.name = input.name;
  if (input.phone !== undefined) update.phone = input.phone || null;
  if (input.newPassword) {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, req.user!.id));
    if (!input.currentPassword || !(await bcrypt.compare(input.currentPassword, u.passwordHash))) {
      throw badRequest('Current password is incorrect.', { currentPassword: 'Current password is incorrect.' });
    }
    update.passwordHash = await bcrypt.hash(input.newPassword, 10);
  }
  await db.update(schema.users).set(update).where(eq(schema.users.id, req.user!.id));
  res.json({ data: await profile(req.user!.id) });
});
