import { Link } from 'react-router-dom';
import { Settings2, Shapes } from 'lucide-react';
import { useAuth } from '../auth';
import { PageHeader, Panel } from '../components/Page';
import { SectionIcon } from '../components/task-bits';
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui';
import { cx } from '../lib/format';
import { useDashboard, useSections } from '../lib/queries';

export function SectionsPage() {
  const sections = useSections();
  const dash = useDashboard();
  const { user } = useAuth();
  const urgent = new Map(dash.data?.sections.map((s) => [s.id, s.urgent]));

  return (
    <Panel>
      <PageHeader
        title="Sections"
        icon={<Shapes className="size-5" />}
        subtitle="Pending purchase tasks by section"
        actions={
          user?.role === 'admin' && (
            <Link to="/settings/sections">
              <Button size="sm" icon={<Settings2 className="size-3.5" />}>
                Manage
              </Button>
            </Link>
          )
        }
      />
      <div className="px-4 sm:px-5">
        {sections.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-[74px]" />)}</div>
        ) : sections.isError ? (
          <ErrorState message="Unable to load sections." onRetry={() => sections.refetch()} />
        ) : !sections.data.length ? (
          <EmptyState icon={<Shapes className="size-5" />} title="No sections yet" body={user?.role === 'admin' ? 'Create sections in Settings.' : 'An admin needs to create sections.'} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {sections.data.map((s) => (
              <Link key={s.id} to={`/sections/${s.id}`} className="group flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3.5 transition-colors hover:border-line-strong hover:bg-subtle/40">
                <span className="flex size-10 items-center justify-center rounded-md bg-subtle text-ink-2 group-hover:bg-accent-soft group-hover:text-accent">
                  <SectionIcon icon={s.icon} className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{s.name}</span>
                  <span className="block truncate text-xs text-ink-3">{s.description ?? ' '}</span>
                </span>
                <span className="text-right">
                  <span className={cx('tabular block text-lg leading-none font-semibold', !s.pendingCount && 'text-ink-3')}>{s.pendingCount}</span>
                  <span className="text-[11px] text-ink-3">pending</span>
                  {!!urgent.get(s.id) && <span className="block text-[11px] font-medium text-urgent">{urgent.get(s.id)} urgent</span>}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
