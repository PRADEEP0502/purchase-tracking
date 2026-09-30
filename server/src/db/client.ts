import fs from 'node:fs';
import path from 'node:path';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { config } from '../config.js';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

let closeFn: () => Promise<void> = async () => {};

/**
 * PGlite is an in-process database: two processes opening the same directory corrupt it.
 * Guard with a PID lock file and refuse to start while another live process holds it.
 * A lock left by a crashed process is cleared, together with PGlite's own stale postmaster.pid.
 */
function acquireDataDirLock(): void {
  const lock = path.join(config.pgliteDir, '..', 'server.lock');
  try {
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    if (pid && pid !== process.pid) {
      let alive = false;
      try {
        process.kill(pid, 0);
        alive = true;
      } catch (e) {
        alive = (e as NodeJS.ErrnoException).code === 'EPERM';
      }
      if (alive) {
        throw new Error(`Another server process (PID ${pid}) is using the database in ${config.pgliteDir}. Stop it first.`);
      }
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  fs.rmSync(path.join(config.pgliteDir, 'postmaster.pid'), { force: true });
  fs.writeFileSync(lock, String(process.pid));
  process.on('exit', () => {
    try {
      if (fs.readFileSync(lock, 'utf8') === String(process.pid)) fs.rmSync(lock, { force: true });
    } catch {
      /* ignore */
    }
  });
}

async function connect(): Promise<Database> {
  if (config.databaseUrl) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: config.databaseUrl,
      max: Number(process.env.PG_POOL_MAX ?? 10),
      options: `-c timezone=${config.timezone}`,
    });
    closeFn = () => pool.end();
    return drizzlePg(pool, { schema });
  }

  // Embedded PostgreSQL (PGlite) for local development and single-machine installs.
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite');
  fs.mkdirSync(config.pgliteDir, { recursive: true });
  acquireDataDirLock();
  const client = new PGlite(config.pgliteDir);
  await client.waitReady;
  await client.query(`SET TIME ZONE '${config.timezone.replace(/'/g, '')}'`);
  closeFn = () => client.close();
  // The PGlite driver exposes the same query-builder API as node-postgres.
  return drizzlePglite(client, { schema }) as unknown as Database;
}

export const db = await connect();

export async function runMigrations(): Promise<void> {
  if (config.databaseUrl) {
    await migratePg(db, { migrationsFolder: config.migrationsDir });
  } else {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(db as never, { migrationsFolder: config.migrationsDir });
  }
}

export function closeDb(): Promise<void> {
  return closeFn();
}

export { schema };
