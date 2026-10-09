import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { db, schema } from '../db/client.js';

/**
 * Session signing secret. Uses JWT_SECRET when provided; otherwise a random secret is
 * generated once and stored in the database, so a fresh deployment needs no manual setup
 * and sign-ins survive restarts. Rotating it (deleting the row) signs everyone out.
 */
let jwt: string | null = null;

export async function initSecrets(): Promise<void> {
  if (config.jwtSecretEnv) {
    jwt = config.jwtSecretEnv;
    return;
  }
  const key = 'jwt_secret';
  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, key));
  if (row) {
    jwt = row.value;
    return;
  }
  const generated = crypto.randomBytes(48).toString('hex');
  // If two instances start together, the first insert wins and both read it back.
  await db.insert(schema.appSettings).values({ key, value: generated }).onConflictDoNothing();
  const [saved] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, key));
  jwt = saved.value;
}

export function jwtSecret(): string {
  if (!jwt) throw new Error('Secrets not initialised — call initSecrets() at startup.');
  return jwt;
}
