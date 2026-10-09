import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const isProduction = process.env.NODE_ENV === 'production';

/** Optional: an explicit session secret. If unset, one is generated and stored in the database. */
function jwtSecretFromEnv(): string | null {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) return null;
  if (secret.length < 32) throw new Error('JWT_SECRET is too short — use at least 32 random characters, or remove it to let the app generate one.');
  return secret;
}

export const config = {
  isProduction,
  port: Number(process.env.PORT ?? 4000),
  /** When set, connect to a real PostgreSQL server. Otherwise an embedded PGlite database is used. */
  databaseUrl: process.env.DATABASE_URL,
  pgliteDir: process.env.PGLITE_DIR ?? path.join(serverRoot, 'data', 'pglite'),
  storageDir: process.env.STORAGE_DIR ?? path.join(serverRoot, 'data', 'uploads'),
  webDistDir: path.resolve(serverRoot, '..', 'web', 'dist'),
  migrationsDir: path.join(serverRoot, 'drizzle'),
  jwtSecretEnv: jwtSecretFromEnv(),
  /** Business timezone: used for "today", date filters and day boundaries. */
  timezone: process.env.APP_TIMEZONE ?? 'Asia/Kolkata',
  sessionDays: 14,
  cookieName: 'jpm_session',
  maxUploadBytes: 10 * 1024 * 1024,
  maxVoiceBytes: 5 * 1024 * 1024,
  /** How often the server checks for reminders to send (0 disables the scheduler). */
  reminderCheckSeconds: Number(process.env.REMINDER_CHECK_SECONDS ?? 60),
  /** Urgent tasks not yet acknowledged are reminded at this interval… */
  urgentReminderMinutes: Math.max(1, Number(process.env.URGENT_REMINDER_MINUTES ?? 10)),
  /** …at most this many times, so reminders never loop forever. */
  urgentReminderMax: Math.max(0, Number(process.env.URGENT_REMINDER_MAX ?? 6)),
};
