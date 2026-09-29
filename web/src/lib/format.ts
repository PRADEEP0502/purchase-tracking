import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday, parseISO, differenceInCalendarDays } from 'date-fns';
import type { Task } from './types';

export function formatQty(q: number): string {
  return Number.isInteger(q) ? String(q) : String(Number(q.toFixed(3)));
}

export function unitLabel(q: number, unit: string): string {
  // "1 No", "2 Nos"
  if (unit === 'Nos' && q === 1) return 'No';
  return unit;
}

export function taskLabel(t: Pick<Task, 'title' | 'quantity' | 'unit'>): string {
  return `${t.title} – ${formatQty(t.quantity)} ${unitLabel(t.quantity, t.unit)}`;
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return format(d, 'yyyy-MM-dd');
}

/** Due date label and tone for lists. */
export function dueInfo(due: string | null, status: Task['status']): { label: string; tone: 'overdue' | 'today' | 'soon' | 'later' } | null {
  if (!due) return null;
  const d = parseISO(due);
  const diff = differenceInCalendarDays(d, new Date());
  const tone = status === 'completed' ? 'later' : diff < 0 ? 'overdue' : diff === 0 ? 'today' : diff <= 2 ? 'soon' : 'later';
  let label: string;
  if (isToday(d)) label = 'Today';
  else if (isTomorrow(d)) label = 'Tomorrow';
  else if (isYesterday(d)) label = 'Yesterday';
  else label = format(d, diff > -180 && diff < 180 ? 'd MMM' : 'd MMM yyyy');
  return { label, tone };
}

export const fmtDate = (iso: string) => format(new Date(iso), 'd MMM yyyy');
export const fmtDateOnly = (iso: string) => format(parseISO(iso), 'd MMM yyyy');
export const fmtTime = (iso: string) => format(new Date(iso), 'h:mm a');
export const fmtDateTime = (iso: string) => format(new Date(iso), 'd MMM yyyy – h:mm a');

export function relative(iso: string): string {
  const d = new Date(iso);
  if (Date.now() - d.getTime() < 60_000) return 'just now';
  if (isToday(d)) return formatDistanceToNowStrict(d, { addSuffix: true });
  if (isYesterday(d)) return `Yesterday, ${format(d, 'h:mm a')}`;
  return format(d, 'd MMM, h:mm a');
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function duration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export const PRIORITY_LABEL = { normal: 'Normal', high: 'High', urgent: 'Urgent' } as const;

export const UNITS = ['Nos', 'M', 'Kg', 'g', 'L', 'ml', 'Packets', 'Box', 'Set', 'Pair', 'Roll', 'Bottle', 'Can', 'Bag', 'Ream', 'Dozen', 'Bundle', 'Ft', 'Sheet', 'Tin', 'Drum'];

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');
