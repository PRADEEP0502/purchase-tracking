import { memo } from 'react';
import { toast } from 'sonner';
import { CalendarDays, Check, MessageSquare, Mic, Paperclip, PencilLine, UserRound, UserRoundPlus } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { cx, dueInfo, fmtDate, fmtTime, formatQty, unitLabel } from '../lib/format';
import { useInvalidateTasks, useUsers } from '../lib/queries';
import type { Task } from '../lib/types';
import { useAppState } from './app-state';
import { Popover, MenuItem } from './Popover';
import { Avatar } from './ui';
import { PriorityBadge, SectionIcon, TaskCheck } from './task-bits';
import { useSections } from '../lib/queries';

function AssignMenu({ task }: { task: Task }) {
  const users = useUsers();
  const invalidate = useInvalidateTasks();
  const assign = async (userId: number | null, close: () => void) => {
    close();
    if (userId === task.assignedTo) return;
    try {
      await api.patch(`/tasks/${task.id}`, { assignedTo: userId });
      invalidate(task.id);
      const name = users.data?.find((u) => u.id === userId)?.name;
      toast.success(name ? `Assigned to ${name}` : 'Unassigned');
    } catch (e) {
      toast.error(errorMessage(e, 'Unable to assign. Please try again.'));
    }
  };
  return (
    <Popover
      width={220}
      trigger={({ toggle, ref, open }) => (
        <button
          ref={ref}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          aria-label="Assign"
          title="Assign"
          className={cx('inline-flex size-7 items-center justify-center rounded-md text-ink-3 hover:bg-muted hover:text-ink', open && 'bg-muted text-ink')}
        >
          <UserRoundPlus className="size-4" />
        </button>
      )}
    >
      {(close) => (
        <div className="scroll-thin overflow-y-auto py-1">
          <p className="px-3 pt-1.5 pb-1 text-xs font-medium text-ink-3">Assign to</p>
          {users.data?.map((u) => (
            <MenuItem key={u.id} active={u.id === task.assignedTo} onClick={() => assign(u.id, close)} icon={<Avatar name={u.name} size={20} />}>
              {u.name}
            </MenuItem>
          ))}
          {task.assignedTo && (
            <MenuItem onClick={() => assign(null, close)} icon={<UserRound className="size-4 text-ink-3" />} className="border-t border-line text-ink-2">
              Unassign
            </MenuItem>
          )}
        </div>
      )}
    </Popover>
  );
}

export const TaskRow = memo(function TaskRow({ task, showSection = true }: { task: Task; showSection?: boolean }) {
  const { openTask, openEdit, quickClose, closingIds, taskId } = useAppState();
  const sections = useSections();
  const closing = closingIds.has(task.id);
  const done = task.status === 'completed' || closing;
  const due = dueInfo(task.dueDate, task.status);
  const icon = sections.data?.find((s) => s.id === task.sectionId)?.icon;
  const selected = taskId === task.id;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openTask(task.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) openTask(task.id);
      }}
      className={cx(
        'group relative flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors outline-none hover:bg-subtle/70 focus-visible:bg-subtle sm:px-5',
        selected && 'bg-accent-soft/60 hover:bg-accent-soft/60',
      )}
    >
      <TaskCheck
        priority={task.priority}
        checked={done}
        disabled={task.status === 'completed' || closing || !task.permissions.close}
        onClick={() => quickClose(task)}
        label={`Close ${task.title}`}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className={cx('min-w-0 truncate text-[14.5px] leading-snug font-medium', done ? 'text-ink-3 line-through decoration-ink-3/60' : 'text-ink')}>
            {task.title}
            <span className="font-normal text-ink-2"> – {formatQty(task.quantity)} {unitLabel(task.quantity, task.unit)}</span>
          </p>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
          {task.status === 'completed' ? (
            <span className="inline-flex items-center gap-1 text-done">
              <Check className="size-3.5" />
              Closed by {task.closerName ?? '—'} · {task.closedAt && `${fmtDate(task.closedAt)}, ${fmtTime(task.closedAt)}`}
            </span>
          ) : (
            <>
              <PriorityBadge priority={task.priority} compact />
              {due && (
                <span
                  className={cx(
                    'inline-flex items-center gap-1',
                    due.tone === 'overdue' && 'font-medium text-urgent',
                    due.tone === 'today' && 'font-medium text-high',
                  )}
                >
                  <CalendarDays className="size-3.5" />
                  {due.tone === 'overdue' ? `Overdue · ${due.label}` : due.label}
                </span>
              )}
            </>
          )}
          {showSection && (
            <span className="inline-flex items-center gap-1">
              <SectionIcon icon={icon} className="size-3.5" />
              {task.sectionName ?? <span className="italic">No section</span>}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            {task.assigneeName ? (
              <>
                <Avatar name={task.assigneeName} size={16} />
                {task.assigneeName}
              </>
            ) : (
              <span className="italic">Unassigned</span>
            )}
          </span>
          {task.attachmentCount > 0 && (
            <span className="inline-flex items-center gap-0.5" title={`${task.attachmentCount} attachment(s)`}>
              <Paperclip className="size-3.5" />
              {task.attachmentCount}
            </span>
          )}
          {task.commentCount + task.voiceNoteCount > 0 && (
            <span className="inline-flex items-center gap-0.5" title="Messages">
              {task.voiceNoteCount > 0 && !task.commentCount ? <Mic className="size-3.5" /> : <MessageSquare className="size-3.5" />}
              {task.commentCount + task.voiceNoteCount}
            </span>
          )}
        </div>
      </div>

      {/* Hover actions (desktop). On touch devices, tapping the row opens full details. */}
      {!done && (
        <div className="absolute top-2.5 right-3 hidden items-center gap-0.5 rounded-md border border-line bg-surface p-0.5 opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 md:flex">
          {task.permissions.edit && (
            <button
              type="button"
              aria-label="Edit"
              title="Edit"
              onClick={(e) => {
                e.stopPropagation();
                openEdit(task);
              }}
              className="inline-flex size-7 items-center justify-center rounded-md text-ink-3 hover:bg-muted hover:text-ink"
            >
              <PencilLine className="size-4" />
            </button>
          )}
          {task.permissions.assign && <AssignMenu task={task} />}
          {task.permissions.close && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                quickClose(task);
              }}
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-done hover:bg-done-soft"
            >
              <Check className="size-3.5" />
              Close
            </button>
          )}
        </div>
      )}
    </div>
  );
});
