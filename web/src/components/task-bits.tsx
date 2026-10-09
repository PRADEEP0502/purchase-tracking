import {
  Boxes,
  Building2,
  Factory,
  FlaskConical,
  Flag,
  Folder,
  Monitor,
  Package,
  Users,
  Wrench,
  Zap,
  Truck,
  ShieldCheck,
  Hammer,
  type LucideIcon,
} from 'lucide-react';
import { cx, PRIORITY_LABEL } from '../lib/format';
import type { Priority, Status } from '../lib/types';

export const SECTION_ICONS: Record<string, LucideIcon> = {
  factory: Factory,
  wrench: Wrench,
  zap: Zap,
  flask: FlaskConical,
  package: Package,
  monitor: Monitor,
  building: Building2,
  users: Users,
  boxes: Boxes,
  truck: Truck,
  shield: ShieldCheck,
  hammer: Hammer,
  folder: Folder,
};

export function SectionIcon({ icon, className }: { icon: string | null | undefined; className?: string }) {
  const Icon = (icon && SECTION_ICONS[icon]) || Folder;
  return <Icon className={cx('size-4 shrink-0', className)} strokeWidth={1.8} />;
}

export const priorityText: Record<Priority, string> = {
  urgent: 'text-urgent',
  high: 'text-high',
  normal: 'text-ink-3',
};

export function PriorityBadge({ priority, compact }: { priority: Priority; compact?: boolean }) {
  if (priority === 'normal' && compact) return null;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded px-1.5 py-px text-xs font-medium',
        priority === 'urgent' && 'bg-urgent-soft text-urgent',
        priority === 'high' && 'bg-high-soft text-high',
        priority === 'normal' && 'bg-subtle text-ink-2',
      )}
    >
      <Flag className="size-3" strokeWidth={2.2} fill={priority === 'normal' ? 'none' : 'currentColor'} />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        status === 'pending' ? 'bg-high-soft text-high' : 'bg-done-soft text-done',
      )}
    >
      <span className={cx('size-1.5 rounded-full', status === 'pending' ? 'bg-pending' : 'bg-done')} />
      {status === 'pending' ? 'Pending' : 'Closed'}
    </span>
  );
}

/** Round checkbox, ring coloured by priority (Todoist-like affordance, JPM styling). */
export function TaskCheck({
  priority,
  checked,
  disabled,
  onClick,
  label,
}: {
  priority: Priority;
  checked: boolean;
  disabled?: boolean;
  onClick?: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={disabled ? (checked ? 'Closed' : 'Only the assigned person or an admin can close this task') : label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={cx(
        'group/check relative mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors',
        checked
          ? 'border-done bg-done text-white'
          : priority === 'urgent'
            ? 'border-urgent bg-urgent-soft'
            : priority === 'high'
              ? 'border-high bg-high-soft'
              : 'border-ink-3/70',
        !disabled && !checked && 'cursor-pointer hover:bg-done-soft hover:border-done',
        disabled && !checked && 'cursor-not-allowed opacity-45',
      )}
    >
      <svg viewBox="0 0 16 16" className={cx('size-3', checked ? 'opacity-100' : 'text-done opacity-0 group-hover/check:opacity-100', disabled && !checked && 'hidden')} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 8.5l3 3 6-7" />
      </svg>
    </button>
  );
}

/**
 * Tones for the default actions, matched by name. Renamed or custom actions use the neutral
 * style, so admins can add any action without a code change.
 */
const ACTION_TONES: Record<string, string> = {
  purchase: 'bg-accent-soft text-accent',
  repair: 'bg-high-soft text-high',
  replacement: 'bg-violet-soft text-violet',
  maintenance: 'bg-done-soft text-done',
  inspection: 'bg-teal-soft text-teal',
  service: 'bg-teal-soft text-teal',
};

export function ActionBadge({ name, className }: { name: string | null | undefined; className?: string }) {
  if (!name) return null;
  return (
    <span
      className={cx(
        'inline-flex max-w-[160px] shrink-0 items-center gap-1 truncate rounded px-1.5 py-px text-[11.5px] leading-[18px] font-semibold',
        ACTION_TONES[name.trim().toLowerCase()] ?? 'bg-subtle text-ink-2',
        className,
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current opacity-70" />
      {name}
    </span>
  );
}

/** Structure context, e.g. "Parent › Child". Never part of the task title. */
export function StructurePath({ path, className }: { path: string[]; className?: string }) {
  if (!path.length) return null;
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-1 text-ink-2', className)} title={path.join(' › ')}>
      <Boxes className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.8} />
      <span className="truncate">
        {path.map((p, i) => (
          <span key={i}>
            {i > 0 && <span className="px-1 text-ink-3">›</span>}
            <span className={i === path.length - 1 ? 'font-medium text-ink' : undefined}>{p}</span>
          </span>
        ))}
      </span>
    </span>
  );
}

const STAGE: Record<string, { label: string; tone: string } | undefined> = {
  assigned: { label: 'Not received yet', tone: 'bg-high-soft text-high' },
  acknowledged: { label: 'Received', tone: 'bg-accent-soft text-accent' },
  in_progress: { label: 'In progress', tone: 'bg-violet-soft text-violet' },
};

/** Work stage chip for open, assigned tasks (nothing for new or completed tasks). */
export function StageBadge({ stage, compact }: { stage: string; compact?: boolean }) {
  const s = STAGE[stage];
  if (!s) return null;
  return (
    <span className={cx('inline-flex items-center gap-1 rounded px-1.5 py-px text-xs font-medium', s.tone)}>
      {stage === 'assigned' && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {compact && stage === 'assigned' ? 'Not received' : s.label}
    </span>
  );
}
