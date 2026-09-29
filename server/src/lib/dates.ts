import { config } from '../config.js';

/** Today's date (yyyy-mm-dd) in the business timezone. */
export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(new Date());
}
