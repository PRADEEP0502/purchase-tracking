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
