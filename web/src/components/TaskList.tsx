import { useEffect, useRef, type ReactNode } from 'react';
import { errorMessage } from '../lib/api';
import { useTasks, type TaskQuery } from '../lib/queries';
import { Button, EmptyState, ErrorState, ListSkeleton, Spinner } from './ui';
import { TaskRow } from './TaskRow';

/**
 * Paginated task list. Loads 30 at a time and fetches more as the user scrolls.
 */
export function TaskList({
  query,
  empty,
  showSection = true,
  onTotal,
}: {
  query: TaskQuery;
  empty: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode };
  showSection?: boolean;
  onTotal?: (n: number) => void;
}) {
  const q = useTasks(query);
  const sentinel = useRef<HTMLDivElement>(null);
  const tasks = q.data?.pages.flatMap((p) => p.data) ?? [];
  const total = q.data?.pages[0]?.meta.total;

  useEffect(() => {
    if (total !== undefined) onTotal?.(total);
  }, [total, onTotal]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !q.hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !q.isFetchingNextPage) q.fetchNextPage();
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [q.hasNextPage, q.isFetchingNextPage, q.fetchNextPage, q]);

  if (q.isPending) return <ListSkeleton />;
  if (q.isError && !tasks.length) return <ErrorState message={errorMessage(q.error, 'Unable to load tasks.')} onRetry={() => q.refetch()} />;
  if (!tasks.length) return <EmptyState {...empty} />;

  return (
    <div className={q.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
      <div className="divide-y divide-line">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} showSection={showSection} />
        ))}
      </div>
      <div ref={sentinel} />
      {q.hasNextPage && (
        <div className="flex justify-center py-4">
          {q.isFetchingNextPage ? (
            <Spinner />
          ) : (
            <Button size="sm" variant="ghost" onClick={() => q.fetchNextPage()}>
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
