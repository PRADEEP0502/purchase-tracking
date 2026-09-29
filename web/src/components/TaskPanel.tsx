import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  Download,
  FileText,
  History,
  MessagesSquare,
  MoreHorizontal,
  PencilLine,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { cx, dueInfo, fileSize, fmtDate, fmtDateOnly, fmtDateTime, fmtTime, formatQty, PRIORITY_LABEL, taskLabel, unitLabel } from '../lib/format';
import { useInvalidateTasks, useSections, useTask, useTaskAction, useTaskActivity, useUpdateTask, useUsers } from '../lib/queries';
import type { ActivityEntry, Priority, TaskDetail } from '../lib/types';
import { useAppState } from './app-state';
import { MenuItem, Popover } from './Popover';
import { PriorityBadge, SectionIcon, StatusBadge } from './task-bits';
import { Composer, Thread } from './Thread';
import { Avatar, Button, ConfirmDialog, ErrorState, IconButton, Segmented, Skeleton } from './ui';

export function TaskPanel() {
  const { taskId, closeTask } = useAppState();

  useEffect(() => {
    if (!taskId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-modal="true"]')) closeTask();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [taskId, closeTask]);

  if (!taskId) return null;
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={closeTask} />
      <aside
        key={taskId}
        aria-label="Task details"
        className="fixed inset-0 z-40 flex flex-col bg-surface animate-panel sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[480px] sm:border-l sm:border-line sm:shadow-2xl lg:shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.12)]"
      >
        <PanelBody taskId={taskId} onClose={closeTask} />
      </aside>
    </>
  );
}

function PanelBody({ taskId, onClose }: { taskId: number; onClose: () => void }) {
  const task = useTask(taskId);
  const [tab, setTab] = useState<'thread' | 'activity'>('thread');

  if (task.isPending) {
    return (
      <>
        <PanelHeader onClose={onClose} />
        <div className="space-y-4 p-5">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-32 w-full" />
        </div>
      </>
    );
  }
  if (task.isError) {
    const notFound = task.error instanceof ApiError && task.error.status === 404;
    return (
      <>
        <PanelHeader onClose={onClose} />
        <ErrorState
          message={notFound ? 'This task does not exist or you do not have access to it.' : errorMessage(task.error, 'Unable to load task.')}
          onRetry={notFound ? undefined : () => task.refetch()}
        />
      </>
    );
  }

  const t = task.data;
  return (
    <>
      <PanelHeader onClose={onClose} task={t} />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="px-5 pt-4 pb-5">
          <Summary task={t} />
          <Details task={t} />
          {t.description && (
            <section className="mt-5">
              <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-ink-3 uppercase">Description</h3>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink">{t.description}</p>
            </section>
          )}
          {t.attachments.length > 0 && <Attachments task={t} />}
        </div>

        <div className="sticky top-0 z-10 border-y border-line bg-surface/95 px-5 py-2 backdrop-blur">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'thread', label: <><MessagesSquare className="size-3.5" /> Conversation</>, count: t.commentCount + t.voiceNoteCount + t.attachmentCount || undefined },
              { value: 'activity', label: <><History className="size-3.5" /> Activity</> },
            ]}
          />
        </div>
        <div className="px-5 pb-4">{tab === 'thread' ? <Thread taskId={t.id} /> : <ActivityLog taskId={t.id} />}</div>
      </div>
      {tab === 'thread' && (
        <div className="border-t border-line bg-canvas/60 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Composer taskId={t.id} />
        </div>
      )}
    </>
  );
}

function PanelHeader({ onClose, task }: { onClose: () => void; task?: TaskDetail }) {
  const { openEdit } = useAppState();
  const action = useTaskAction();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const del = async () => {
    if (!task) return;
    try {
      await action.mutateAsync({ id: task.id, action: 'delete' });
      toast.success('Task deleted');
      setConfirmDelete(false);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, 'Unable to delete task.'));
    }
  };

  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2 pt-[env(safe-area-inset-top)] sm:px-3">
      <IconButton label="Back" onClick={onClose} className="sm:hidden">
        <ArrowLeft className="size-5" />
      </IconButton>
      {task && (
        <span className="tabular ml-1 text-xs font-medium text-ink-3">
          #{task.id}
          {task.sectionName && <span className="text-ink-3"> · {task.sectionName}</span>}
        </span>
      )}
      <span className="flex-1" />
      {task?.permissions.edit && (
        <IconButton label="Edit task" onClick={() => openEdit(task)}>
          <PencilLine className="size-4" />
        </IconButton>
      )}
      {task?.permissions.delete && (
        <Popover
          width={180}
          trigger={({ toggle, ref }) => (
            <IconButton label="More actions" onClick={toggle} ref={ref}>
              <MoreHorizontal className="size-4" />
            </IconButton>
          )}
        >
          {(close) => (
            <div className="py-1">
              <MenuItem
                icon={<Trash2 className="size-4 text-urgent" />}
                className="text-urgent"
                onClick={() => {
                  close();
                  setConfirmDelete(true);
                }}
              >
                Delete task
              </MenuItem>
            </div>
          )}
        </Popover>
      )}
      <IconButton label="Close panel" onClick={onClose} className="hidden sm:inline-flex">
        <X className="size-4" />
      </IconButton>
      {task && (
        <ConfirmDialog
          open={confirmDelete}
          title="Delete this purchase task?"
          body={
            <>
              <strong className="text-ink">{taskLabel(task)}</strong> and its messages, voice notes and attachments will be permanently removed.
            </>
          }
          confirmLabel="Delete"
          tone="danger"
          loading={action.isPending}
          onConfirm={del}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

function Summary({ task }: { task: TaskDetail }) {
  const action = useTaskAction();
  const [confirm, setConfirm] = useState<'close' | 'reopen' | null>(null);

  const run = async () => {
    if (!confirm) return;
    try {
      await action.mutateAsync({ id: task.id, action: confirm });
      toast.success(confirm === 'close' ? `Closed ${taskLabel(task)}` : 'Task reopened');
      setConfirm(null);
    } catch (e) {
      toast.error(errorMessage(e, 'Unable to update task. Please try again.'));
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <h2 className={cx('text-xl leading-snug font-semibold tracking-tight', task.status === 'completed' && 'text-ink-2')}>
          {task.title} <span className="font-normal text-ink-2">– {formatQty(task.quantity)} {unitLabel(task.quantity, task.unit)}</span>
        </h2>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <StatusBadge status={task.status} />
        <PriorityBadge priority={task.priority} />
      </div>

      {task.status === 'pending' ? (
        task.permissions.close ? (
          <Button variant="success" size="lg" className="mt-4 w-full" icon={<Check className="size-4" strokeWidth={2.5} />} onClick={() => setConfirm('close')}>
            Close Task
          </Button>
        ) : (
          <p className="mt-4 rounded-md bg-subtle px-3 py-2 text-[13px] text-ink-2">
            {task.assigneeName ? `Waiting for ${task.assigneeName} to purchase and close this task.` : 'Assign this task so someone can purchase it.'}
          </p>
        )
      ) : (
        <div className="mt-4 rounded-lg border border-done/25 bg-done-soft px-4 py-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-done" />
            <dl className="grid flex-1 grid-cols-[80px_1fr] gap-y-0.5 text-sm">
              <dt className="text-ink-2">Closed by</dt>
              <dd className="font-medium">{task.closerName ?? '—'}</dd>
              <dt className="text-ink-2">Closed on</dt>
              <dd className="font-medium">{task.closedAt && fmtDate(task.closedAt)}</dd>
              <dt className="text-ink-2">Closed at</dt>
              <dd className="font-medium">{task.closedAt && fmtTime(task.closedAt)}</dd>
            </dl>
          </div>
          {task.permissions.reopen && (
            <Button size="sm" className="mt-3" icon={<RotateCcw className="size-3.5" />} onClick={() => setConfirm('reopen')}>
              Reopen task
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'close' ? 'Close this purchase task?' : 'Reopen this task?'}
        body={
          <>
            <strong className="text-ink">{taskLabel(task)}</strong>
            {confirm === 'reopen' && <span className="mt-1 block">It will move back to Pending.</span>}
          </>
        }
        confirmLabel={confirm === 'close' ? 'Yes, Close' : 'Reopen'}
        tone={confirm === 'close' ? 'success' : 'primary'}
        loading={action.isPending}
        onConfirm={run}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="py-1.5 text-[13px] text-ink-3">{label}</dt>
      <dd className="min-w-0 py-1.5 text-sm text-ink">{children}</dd>
    </>
  );
}

function Details({ task }: { task: TaskDetail }) {
  const users = useUsers();
  const sections = useSections();
  const update = useUpdateTask(task.id);
  const invalidate = useInvalidateTasks();
  const due = dueInfo(task.dueDate, task.status);
  const editable = task.status === 'pending';

  const patch = async (input: Record<string, unknown>, message: string) => {
    try {
      await update.mutateAsync(input);
      invalidate(task.id);
      toast.success(message);
    } catch (e) {
      toast.error(errorMessage(e, 'Unable to update task.'));
    }
  };

  const inlineSelect = 'max-w-full -ml-1.5 rounded px-1.5 py-0.5 text-sm bg-transparent hover:bg-subtle focus:bg-subtle cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/20';

  return (
    <dl className="mt-5 grid grid-cols-[104px_1fr] border-t border-line pt-2">
      <Row label="Section">
        {editable && task.permissions.edit ? (
          <select className={inlineSelect} value={task.sectionId ?? ''} onChange={(e) => patch({ sectionId: e.target.value ? Number(e.target.value) : null }, 'Section updated')}>
            <option value="">No section (Inbox)</option>
            {sections.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <SectionIcon icon={sections.data?.find((s) => s.id === task.sectionId)?.icon} className="text-ink-3" />
            {task.sectionName ?? 'No section'}
          </span>
        )}
      </Row>
      <Row label="Assigned">
        <span className="inline-flex max-w-full items-center gap-1.5">
          <Avatar name={task.assigneeName} size={20} />
          {editable && task.permissions.assign ? (
            <select className={inlineSelect} value={task.assignedTo ?? ''} onChange={(e) => patch({ assignedTo: e.target.value ? Number(e.target.value) : null }, 'Assignment updated')}>
              <option value="">Unassigned</option>
              {users.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          ) : (
            (task.assigneeName ?? <span className="text-ink-3">Unassigned</span>)
          )}
        </span>
      </Row>
      <Row label="Priority">
        {editable && task.permissions.edit ? (
          <select
            className={cx(inlineSelect, task.priority === 'urgent' && 'text-urgent', task.priority === 'high' && 'text-high')}
            value={task.priority}
            onChange={(e) => patch({ priority: e.target.value }, 'Priority updated')}
          >
            {(['normal', 'high', 'urgent'] as Priority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        ) : (
          PRIORITY_LABEL[task.priority]
        )}
      </Row>
      <Row label="Due date">
        {task.dueDate ? (
          <span className={cx('inline-flex items-center gap-1.5', due?.tone === 'overdue' && 'font-medium text-urgent')}>
            <CalendarDays className="size-3.5" />
            {fmtDateOnly(task.dueDate)}
            {due?.tone === 'overdue' && ' · Overdue'}
          </span>
        ) : (
          <span className="text-ink-3">—</span>
        )}
      </Row>
      <Row label="Created">{fmtDateTime(task.createdAt)}</Row>
      <Row label="Created by">{task.creatorName}</Row>
    </dl>
  );
}

function Attachments({ task }: { task: TaskDetail }) {
  const invalidate = useInvalidateTasks();
  const [deleting, setDeleting] = useState<number | null>(null);

  const remove = async (id: number) => {
    setDeleting(id);
    try {
      await api.del(`/tasks/${task.id}/attachments/${id}`);
      invalidate(task.id);
      toast.success('Attachment deleted');
    } catch (e) {
      toast.error(errorMessage(e, 'Unable to delete attachment.'));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <section className="mt-5">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">Attachments · {task.attachments.length}</h3>
      <ul className="grid gap-2">
        {task.attachments.map((a) => (
          <li key={a.id} className="group flex items-center gap-3 rounded-lg border border-line p-2">
            <a href={a.url} target="_blank" rel="noreferrer" className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-subtle">
              {a.fileType.startsWith('image/') ? (
                <img src={a.url} alt="" loading="lazy" className="size-full object-cover" />
              ) : (
                <FileText className="size-5 text-ink-3" />
              )}
            </a>
            <div className="min-w-0 flex-1">
              <a href={a.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-ink hover:underline">
                {a.fileName}
              </a>
              <p className="text-xs text-ink-3">
                {fileSize(a.fileSize)} · {a.uploaderName} · {fmtDate(a.createdAt)}
              </p>
            </div>
            <a href={`${a.url}?download=1`} download={a.fileName} aria-label={`Download ${a.fileName}`} title="Download" className="inline-flex size-8 items-center justify-center rounded-md text-ink-3 hover:bg-subtle hover:text-ink">
              <Download className="size-4" />
            </a>
            {a.canDelete && (
              <IconButton label={`Delete ${a.fileName}`} onClick={() => remove(a.id)} disabled={deleting === a.id}>
                <Trash2 className="size-4" />
              </IconButton>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function describeActivity(a: ActivityEntry): string {
  const who = a.userName ?? 'Someone';
  switch (a.action) {
    case 'created':
      return a.metadata?.via === 'voice' ? `${who} created task by voice` : `${who} created task`;
    case 'assigned':
      return a.metadata?.toName ? `Assigned to ${a.metadata.toName}` : `${who} removed the assignee`;
    case 'updated':
      return `${who} updated ${(a.metadata?.fields as string[] | undefined)?.map((f) => ({ sectionId: 'section', dueDate: 'due date', assignedTo: 'assignee' })[f] ?? f).join(', ') ?? 'the task'}`;
    case 'closed':
      return `${who} closed the task`;
    case 'reopened':
      return `${who} reopened the task`;
    case 'commented':
      return `${who} added a message`;
    case 'voice_note_added':
      return `${who} added a voice note`;
    case 'attachment_added':
      return `${who} attached ${a.metadata?.fileName ?? 'a file'}`;
    case 'attachment_deleted':
      return `${who} removed ${a.metadata?.fileName ?? 'a file'}`;
    case 'deleted':
      return `${who} deleted ${a.metadata?.title ?? 'a task'}`;
    default:
      return `${who} ${a.action}`;
  }
}

function ActivityLog({ taskId }: { taskId: number }) {
  const activity = useTaskActivity(taskId, true);
  if (activity.isPending) return <div className="space-y-3 py-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>;
  if (activity.isError) return <ErrorState message="Unable to load activity." onRetry={() => activity.refetch()} />;
  return (
    <ol className="relative mt-3 ml-1.5 border-l border-line">
      {activity.data.map((a) => (
        <li key={a.id} className="relative pb-4 pl-5 last:pb-1">
          <span
            className={cx(
              'absolute top-1.5 -left-[5px] size-[9px] rounded-full border-2 border-surface',
              a.action === 'closed' ? 'bg-done' : a.action === 'created' ? 'bg-accent' : a.action === 'reopened' ? 'bg-high' : 'bg-line-strong',
            )}
          />
          <p className="text-[13px] text-ink">{describeActivity(a)}</p>
          <p className="tabular text-xs text-ink-3">{fmtDateTime(a.createdAt)}</p>
        </li>
      ))}
    </ol>
  );
}
