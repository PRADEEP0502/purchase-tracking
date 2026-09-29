import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Inbox, Mic, Plus } from 'lucide-react';
import { useAuth } from '../auth';
import { useAppState } from '../components/app-state';
import { SectionIcon } from '../components/task-bits';
import { TaskList } from '../components/TaskList';
import { describeActivity } from '../components/TaskPanel';
import { ErrorState, Skeleton } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { cx, relative } from '../lib/format';
import { useDashboard } from '../lib/queries';
import type { ActivityEntry } from '../lib/types';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function Kpi({ to, label, value, tone, note }: { to: string; label: string; value: number | undefined; tone?: 'urgent' | 'pending' | 'done'; note?: string }) {
  return (
    <Link
      to={to}
      className="group relative rounded-lg border border-line bg-surface px-4 py-3.5 transition-colors hover:border-line-strong hover:bg-subtle/40 focus-visible:border-accent"
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-3 uppercase">
        {tone && <span className={cx('size-2 rounded-full', tone === 'urgent' && 'bg-urgent', tone === 'pending' && 'bg-pending', tone === 'done' && 'bg-done')} />}
        {label}
      </p>
      {value === undefined ? (
        <Skeleton className="mt-2 h-8 w-12" />
      ) : (
        <p className={cx('tabular mt-1 text-[30px] leading-tight font-semibold tracking-tight', tone === 'urgent' && value > 0 && 'text-urgent')}>{value}</p>
      )}
      <p className="mt-0.5 h-4 text-xs text-ink-3">{note}</p>
      <ArrowRight className="absolute top-3.5 right-3.5 size-4 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

function RecentActivity() {
  const activity = useQuery({
    queryKey: ['tasks', 'activity-feed'],
    queryFn: () => api.get<ActivityEntry[]>('/activity?limit=8').then((r) => r.data),
  });
  const { openTask } = useAppState();
  if (activity.isPending) return <div className="space-y-3 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8" />)}</div>;
  if (activity.isError) return <ErrorState message="Unable to load activity." onRetry={() => activity.refetch()} />;
  if (!activity.data.length) return <p className="p-4 text-sm text-ink-3">No activity yet.</p>;
  return (
    <ul className="divide-y divide-line">
      {activity.data.map((a) => (
        <li key={a.id}>
          <button disabled={!a.taskId || !a.taskTitle} onClick={() => a.taskId && openTask(a.taskId)} className="w-full px-4 py-2.5 text-left hover:bg-subtle/60 disabled:hover:bg-transparent">
            <p className="truncate text-[13px] text-ink">
              {describeActivity(a)}
              {a.taskTitle && <span className="text-ink-2"> · {a.taskTitle}</span>}
            </p>
            <p className="text-xs text-ink-3">{relative(a.createdAt)}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const dash = useDashboard();
  const { openCreate, openVoice } = useAppState();
  const c = dash.data?.counts;

  return (
    <div className="@container mx-auto w-full max-w-[1120px]">
      <div className="px-4 pt-5 sm:px-5 sm:pt-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] leading-tight font-semibold tracking-tight">
              {greeting()}, {user?.name}
            </h1>
            <p className="mt-1 text-sm text-ink-3">
              {c ? (
                <>
                  {c.mine > 0 ? (
                    <Link to="/my" className="font-medium text-accent hover:underline">
                      {c.mine} purchase{c.mine === 1 ? '' : 's'} waiting for you
                    </Link>
                  ) : (
                    'Nothing assigned to you right now'
                  )}
                  {c.completedToday > 0 && ` · ${c.completedToday} closed today`}
                </>
              ) : (
                ' '
              )}
            </p>
          </div>
          <div className="hidden gap-2 sm:flex md:hidden">
            <button onClick={openVoice} className="inline-flex h-9 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium">
              <Mic className="size-4 text-accent" /> Voice
            </button>
            <button onClick={() => openCreate()} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-ink">
              <Plus className="size-4" /> Add
            </button>
          </div>
        </div>

        {dash.isError ? (
          <ErrorState message={errorMessage(dash.error, 'Unable to load dashboard.')} onRetry={() => dash.refetch()} />
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3 @2xl:grid-cols-4">
            <Kpi to="/all" label="Total" value={c?.total} note={c ? `${c.inbox} in inbox` : undefined} />
            <Kpi to="/all?status=pending" label="Pending" value={c?.pending} tone="pending" note={c && c.overdue > 0 ? `${c.overdue} overdue` : 'None overdue'} />
            <Kpi to="/priority?level=urgent" label="Urgent" value={c?.urgent} tone="urgent" note="Pending, urgent" />
            <Kpi to="/completed" label="Completed" value={c?.completed} tone="done" note={c ? `${c.completedToday} today` : undefined} />
          </div>
        )}

        {c && c.inbox > 0 && (
          <Link to="/inbox" className="mt-3 flex items-center gap-2.5 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm hover:bg-subtle/60">
            <Inbox className="size-4 text-ink-3" />
            <span className="flex-1">
              <strong className="font-semibold">{c.inbox}</strong> request{c.inbox === 1 ? '' : 's'} in Inbox need a section or person
            </span>
            <ArrowRight className="size-4 text-ink-3" />
          </Link>
        )}
      </div>

      <div className="mt-6 grid gap-5 px-4 sm:px-5 @4xl:grid-cols-[1fr_300px]">
        <section className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <AlertTriangle className="size-4 text-urgent" /> Needs attention
            </h2>
            <Link to="/priority" className="text-xs font-medium text-accent hover:underline">
              View all
            </Link>
          </div>
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <TaskList query={{ view: 'priority' }} empty={{ title: 'No urgent or high-priority purchases pending', body: 'Good work — nothing is waiting.' }} />
          </div>
        </section>

        <div className="space-y-5">
          <section>
            <h2 className="mb-2 text-sm font-semibold">Sections</h2>
            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              {dash.isPending ? (
                <div className="space-y-2 p-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-6" />)}</div>
              ) : (
                <ul className="divide-y divide-line">
                  {dash.data?.sections.map((s) => (
                    <li key={s.id}>
                      <Link to={`/sections/${s.id}`} className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-subtle/60">
                        <SectionIcon icon={s.icon} className="text-ink-3" />
                        <span className="flex-1 truncate">{s.name}</span>
                        {s.urgent > 0 && <span className="rounded bg-urgent-soft px-1.5 text-xs font-medium text-urgent">{s.urgent} urgent</span>}
                        <span className={cx('tabular text-[13px]', s.pending ? 'font-medium text-ink' : 'text-ink-3')}>{s.pending} pending</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold">Recent activity</h2>
            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              <RecentActivity />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
