import { Router } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { parse } from '../lib/http.js';
import { pushEnabled, vapidKey } from '../services/push.js';

/** Registers this device for push alerts (Firebase Cloud Messaging token). */
export const pushRouter = Router();

pushRouter.get('/config', (_req, res) => {
  res.json({ data: { enabled: pushEnabled(), vapidKey: pushEnabled() ? vapidKey() : null } });
});

const tokenBody = z.object({ token: z.string().trim().min(20).max(4096) });

pushRouter.post('/subscribe', async (req, res) => {
  const { token } = parse(tokenBody, req.body);
  const user = req.user!;
  // A device that changes hands moves to the user now signed in on it.
  await db
    .insert(schema.pushTokens)
    .values({ userId: user.id, token, userAgent: req.get('user-agent')?.slice(0, 300) ?? null })
    .onConflictDoUpdate({
      target: schema.pushTokens.token,
      set: { userId: user.id, lastSeenAt: new Date(), userAgent: req.get('user-agent')?.slice(0, 300) ?? null },
    });
  res.json({ data: { ok: true } });
});

/** Called on sign-out so the next person on this device does not get the previous user's alerts. */
pushRouter.post('/unsubscribe', async (req, res) => {
  const { token } = parse(tokenBody, req.body);
  await db.delete(schema.pushTokens).where(and(eq(schema.pushTokens.token, token), eq(schema.pushTokens.userId, req.user!.id)));
  res.json({ data: { ok: true } });
});
