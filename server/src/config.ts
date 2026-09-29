import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const isProduction = process.env.NODE_ENV === 'production';

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (isProduction) {
    throw new Error('JWT_SECRET must be set (at least 32 characters) in production.');
  }
  // Development only: generate a secret once and keep it in the (git-ignored) data folder
  // so sessions survive server restarts.
  const file = path.join(serverRoot, 'data', '.dev-jwt-secret');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const generated = crypto.randomBytes(48).toString('hex');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, generated, { mode: 0o600 });
    return generated;
  }
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
  jwtSecret: jwtSecret(),
  /** Business timezone: used for "today", date filters and day boundaries. */
  timezone: process.env.APP_TIMEZONE ?? 'Asia/Kolkata',
  sessionDays: 14,
  cookieName: 'jpm_session',
  maxUploadBytes: 10 * 1024 * 1024,
  maxVoiceBytes: 5 * 1024 * 1024,
};
