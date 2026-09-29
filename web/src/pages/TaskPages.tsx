import { useCallback, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { endOfMonth, format, startOfMonth, startOfWeek, subDays } from 'date-fns';
import { CheckCircle2, Flag, Inbox, LayoutList, PartyPopper, Search, UserRoundCheck } from 'lucide-react';
import { useAppState } from '../components/app-state';
import { FilterBar, useUrlFilters } from '../components/Filters';
import { AddRow, ListCard, PageHeader, Panel } from '../components/Page';
import { SectionIcon } from '../components/task-bits';
import { TaskList } from '../components/TaskList';
import { Button, EmptyState, Input, Segmented } from '../components/ui';
import { useSections } from '../lib/queries';

function useTotal() {
  const [total, setTotal] = useState<number | undefined>();
  const onTotal = useCallback((n: number) => setTotal(n), []);
  return [total, onTotal] as const;
}

const countLabel = (n: number | undefined, noun: string) => (n === undefined ? ' ' : `${n} ${noun}${n === 1 ? '' : 's'}`);

export function InboxPage() {
  const [total, onTotal] = useTotal();
  return (
    <Panel>
      <PageHeader title="Inbox" icon={<Inbox className="size-5" />} subtitle={total === undefined ? ' ' : `${countLabel(total, 'request')} without a section or person — sort them out here`} />
      <ListCard>
        <TaskList
          query={{ view: 'inbox' }}
          onTotal={onTotal}
          empty={{ icon: <PartyPopper className="size-5" />, title: 'Inbox is clear', body: 'Every purchase request has a section and a person assigned.' }}
        />
        <AddRow />
      </ListCard>
    </Panel>
  );
}

type MyTab = 'today' | 'upcoming' | 'pending' | 'completed';

export function MyTasksPage() {
  const [params, setParams] = useSearchParams();
  const tab = (['today', 'upcoming', 'pending', 'completed'].includes(params.get('tab') ?? '') ? params.get('tab') : 'pending') as MyTab;
  const [total, onTotal] = useTotal();
  const setTab = (t: MyTab) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set('tab', t);
      return n;
    });

  const query = {
    today: { view: 'mine' as const, due: 'today' as const },
    upcoming: { view: 'mine' as const, due: 'upcoming' as const },
    pending: { view: 'mine' as const, status: ['pending'] },
    completed: { view: 'mine' as const, status: ['completed'] },
  }[tab];

  const empty = {
    today: { icon: <PartyPopper className="size-5" />, title: 'Nothing due today', body: 'Tasks due today or overdue will show here.' },
    upcoming: { icon: <UserRoundCheck className="size-5" />, title: 'No upcoming due dates', body: 'Tasks assigned to you with a future due date appear here.' },
    pending: { icon: <PartyPopper className="size-5" />, title: 'No pending purchase tasks.', body: '🎉 Everything is completed.' },
    completed: { icon: <CheckCircle2 className="size-5" />, title: 'No completed tasks yet', body: 'Tasks you close will be listed here.' },
  }[tab];

  return (
    <Panel>
      <PageHeader title="My Tasks" icon={<UserRoundCheck className="size-5" />} subtitle={countLabel(total, tab === 'completed' ? 'completed task' : 'task')}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'pending', label: 'Pending' },
            { value: 'completed', label: 'Completed' },
          ]}
        />
      </PageHeader>
      <ListCard>
        <TaskList key={tab} query={query} onTotal={onTotal} empty={empty} />
      </ListCard>
    </Panel>
  );
}

export function AllTasksPage() {
  const { query, active } = useUrlFilters();
  const [total, onTotal] = useTotal();
  return (
    <Panel>
      <PageHeader title="All Tasks" icon={<LayoutList className="size-5" />} subtitle={countLabel(total, 'task')}>
        <FilterBar />
      </PageHeader>
      <ListCard>
        <TaskList
          query={{ view: 'all', ...query }}
          onTotal={onTotal}
          empty={active ? { icon: <Search className="size-5" />, title: 'No tasks match these filters', body: 'Try removing a filter.' } : { icon: <LayoutList className="size-5" />, title: 'No purchase tasks yet', body: 'Create the first one with Add Purchase or your voice.' }}
        />
        {!active && <AddRow />}
      </ListCard>
    </Panel>
  );
}

export function PriorityPage() {
  const [total, onTotal] = useTotal();
  const [params, setParams] = useSearchParams();
  const level = params.get('level') === 'urgent' ? 'urgent' : 'all';
  return (
    <Panel>
      <PageHeader title="Priority" icon={<Flag className="size-5" />} subtitle={total === undefined ? ' ' : `${countLabel(total, 'pending task')} marked ${level === 'urgent' ? 'urgent' : 'high or urgent'}`}>
        <Segmented
          value={level}
          onChange={(v) =>
            setParams((p) => {
              const n = new URLSearchParams(p);
              if (v === 'all') n.delete('level');
              else n.set('level', v);
              return n;
            })
          }
          options={[
            { value: 'all', label: 'High & Urgent' },
            { value: 'urgent', label: 'Urgent only' },
          ]}
        />
      </PageHeader>
      <ListCard>
        <TaskList
          key={level}
          query={level === 'urgent' ? { status: ['pending'], priority: ['urgent'] } : { view: 'priority' }}
          onTotal={onTotal}
          empty={{ icon: <PartyPopper className="size-5" />, title: 'No priority purchases pending', body: 'Nothing urgent right now.' }}
        />
      </ListCard>
    </Panel>
  );
}

type Range = 'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom';

function rangeDates(r: Range): { from?: string; to?: string } {
  const d = (x: Date) => format(x, 'yyyy-MM-dd');
  const now = new Date();
  switch (r) {
    case 'today':
      return { from: d(now), to: d(now) };
    case 'yesterday':
      return { from: d(subDays(now, 1)), to: d(subDays(now, 1)) };
    case 'week':
      return { from: d(startOfWeek(now, { weekStartsOn: 1 })), to: d(now) };
    case 'month':
      return { from: d(startOfMonth(now)), to: d(endOfMonth(now)) };
    default:
      return {};
  }
}

export function CompletedPage() {
  const [params, setParams] = useSearchParams();
  const range = (params.get('range') as Range) || 'all';
  const [total, onTotal] = useTotal();
  const { query: filters } = useUrlFilters();
  const custom = { from: params.get('from') ?? '', to: params.get('to') ?? '' };
  const dates = range === 'custom' ? { from: custom.from || undefined, to: custom.to || undefined } : rangeDates(range);

  const update = (k: string, v: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        return n;
      },
      { replace: true },
    );

  return (
    <Panel>
      <PageHeader title="Completed" icon={<CheckCircle2 className="size-5" />} subtitle={countLabel(total, 'completed purchase')}>
        <div className="space-y-3">
          <Segmented
            value={range}
            onChange={(v) => update('range', v === 'all' ? '' : v)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'today', label: 'Today' },
              { value: 'yesterday', label: 'Yesterday' },
              { value: 'week', label: 'This Week' },
              { value: 'month', label: 'This Month' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
          {range === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
              <Input type="date" value={custom.from} max={custom.to || undefined} onChange={(e) => update('from', e.target.value)} className="w-auto" aria-label="From date" />
              <span>to</span>
              <Input type="date" value={custom.to} min={custom.from || undefined} onChange={(e) => update('to', e.target.value)} className="w-auto" aria-label="To date" />
            </div>
          )}
          <FilterBar hide={['status', 'due', 'created']} />
        </div>
      </PageHeader>
      <ListCard>
        <TaskList
          query={{ ...filters, view: 'completed', status: [], closedFrom: dates.from, closedTo: dates.to }}
          onTotal={onTotal}
          empty={{ icon: <CheckCircle2 className="size-5" />, title: 'No completed purchases in this period' }}
        />
      </ListCard>
    </Panel>
  );
}

export function SectionPage() {
  const { id } = useParams();
  const sectionId = Number(id);
  const sections = useSections();
  const { openCreate } = useAppState();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') === 'completed' ? 'completed' : 'pending';
  const [total, onTotal] = useTotal();
  const section = sections.data?.find((s) => s.id === sectionId);

  if (sections.isSuccess && !section) {
    return <EmptyState title="Section not found" body="It may have been disabled by an admin." />;
  }

  return (
    <Panel>
      <PageHeader
        title={section?.name ?? ' '}
        icon={<SectionIcon icon={section?.icon} className="size-5" />}
        subtitle={section?.description ?? countLabel(total, status === 'pending' ? 'pending task' : 'completed task')}
        actions={
          <Button size="sm" variant="primary" className="hidden sm:inline-flex" onClick={() => openCreate({ sectionId })}>
            Add Purchase
          </Button>
        }
      >
        <Segmented
          value={status}
          onChange={(v) =>
            setParams((p) => {
              const n = new URLSearchParams(p);
              if (v === 'pending') n.delete('status');
              else n.set('status', v);
              return n;
            })
          }
          options={[
            { value: 'pending', label: 'Pending', count: status === 'pending' ? total : section?.pendingCount },
            { value: 'completed', label: 'Completed' },
          ]}
        />
      </PageHeader>
      <ListCard>
        <TaskList
          key={`${sectionId}-${status}`}
          query={{ section: [sectionId], status: [status], view: status === 'completed' ? 'completed' : undefined }}
          showSection={false}
          onTotal={onTotal}
          empty={
            status === 'pending'
              ? {
                  icon: <SectionIcon icon={section?.icon} className="size-5" />,
                  title: `No purchase tasks in ${section?.name ?? 'this section'}.`,
                  action: (
                    <Button variant="primary" size="sm" onClick={() => openCreate({ sectionId })}>
                      + Add Purchase
                    </Button>
                  ),
                }
              : { icon: <CheckCircle2 className="size-5" />, title: 'No completed tasks in this section yet' }
          }
        />
        {status === 'pending' && <AddRow sectionId={sectionId} />}
      </ListCard>
    </Panel>
  );
}

export function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const { query } = useUrlFilters();
  const [total, onTotal] = useTotal();
  return (
    <Panel>
      <PageHeader title={<>Results for “{q}”</>} icon={<Search className="size-5" />} subtitle={countLabel(total, 'match')}>
        <FilterBar />
      </PageHeader>
      <ListCard>
        <TaskList
          query={{ ...query, q }}
          onTotal={onTotal}
          empty={{ icon: <Search className="size-5" />, title: `No tasks found for “${q}”`, body: 'Search looks in item names, descriptions, sections, people and messages.' }}
        />
      </ListCard>
    </Panel>
  );
}
