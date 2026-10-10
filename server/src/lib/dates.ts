import { sql } from 'drizzle-orm';
import { config } from '../config.js';

/**
 * Start / end (exclusive) of a calendar day in the business timezone, as SQL.
 * Explicit so results do not depend on the database session's timezone — which also
 * keeps the app compatible with connection poolers that reject startup options.
 */
export const dayStart = (d: string) => sql`(${d}::date::timestamp at time zone ${config.timezone})`;
export const dayEnd = (d: string) => sql`((${d}::date + 1)::timestamp at time zone ${config.timezone})`;

/** Today's date (yyyy-mm-dd) in the business timezone. */
export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(new Date());
}
