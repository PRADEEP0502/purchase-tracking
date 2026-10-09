import { inArray } from 'drizzle-orm';
import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { db, schema } from '../db/client.js';

/**
 * Push alerts through Firebase Cloud Messaging, so phones ring even when the app is closed.
 *
 * Enabled only when both are set:
 *   FIREBASE_SERVICE_ACCOUNT — the service-account JSON (raw or base64). Secret; server only.
 *   FIREBASE_VAPID_KEY       — the Web Push certificate public key, sent to browsers.
 * Without them everything else works and in-app/browser alerts are used as before.
 */

let app: App | null | undefined;

function firebase(): App | null {
  if (app !== undefined) return app;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw || !process.env.FIREBASE_VAPID_KEY) return (app = null);
  try {
    const json = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    app = getApps()[0] ?? initializeApp({ credential: cert(json) });
    console.log(`Push alerts enabled (Firebase project ${json.project_id}).`);
  } catch (e) {
    console.error('[push] FIREBASE_SERVICE_ACCOUNT is not valid JSON — push alerts disabled.', (e as Error).message);
    app = null;
  }
  return app;
}

export const pushEnabled = () => firebase() !== null;
export const vapidKey = () => process.env.FIREBASE_VAPID_KEY ?? null;

export interface PushPayload {
  title: string;
  body: string;
  taskId: number;
  level: 'normal' | 'high' | 'urgent';
  kind: string;
}

/** Tokens Firebase reports as dead are removed so we stop sending to them. */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export async function sendPush(userIds: number[], payload: PushPayload): Promise<void> {
  const fb = firebase();
  if (!fb || !userIds.length) return;
  const rows = await db
    .select({ token: schema.pushTokens.token })
    .from(schema.pushTokens)
    .where(inArray(schema.pushTokens.userId, userIds));
  const tokens = rows.map((r) => r.token);
  if (!tokens.length) return;

  const res = await getMessaging(fb).sendEachForMulticast({
    tokens,
    // Data-only message: the app's service worker shows it (and opens the task on tap).
    data: {
      title: payload.title,
      body: payload.body,
      taskId: String(payload.taskId),
      level: payload.level,
      kind: payload.kind,
    },
    webpush: {
      headers: { Urgency: payload.level === 'normal' ? 'normal' : 'high', TTL: String(24 * 60 * 60) },
    },
  });

  const dead = res.responses.flatMap((r, i) => (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code) ? [tokens[i]] : []));
  if (dead.length) await db.delete(schema.pushTokens).where(inArray(schema.pushTokens.token, dead));
  const failed = res.failureCount - dead.length;
  if (failed > 0) console.warn(`[push] ${failed} push message(s) failed`);
}
