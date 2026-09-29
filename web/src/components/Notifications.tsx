import { useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '../lib/api';
import { cx, relative } from '../lib/format';
import { useNotifications } from '../lib/queries';
import { useAppState } from './app-state';
import { Popover } from './Popover';
import { EmptyState, IconButton, Spinner } from './ui';

export function NotificationsButton({ className }: { className?: string }) {
  const n = useNotifications();
  const qc = useQueryClient();
  const { openTask } = useAppState();
  const unread = n.data?.unread ?? 0;

  const markRead = async (ids?: number[]) => {
    try {
      await api.post('/notifications/read', ids ? { ids } : {});
    } finally {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    }
  };

  return (
    <Popover
      width={360}
      trigger={({ toggle, ref }) => (
        <IconButton label={unread ? `Notifications, ${unread} unread` : 'Notifications'} onClick={toggle} ref={ref} className={cx('relative', className)}>
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="tabular absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-urgent px-1 text-[10px] font-semibold text-white ring-2 ring-surface">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </IconButton>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button onClick={() => markRead()} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                <CheckCheck className="size-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="scroll-thin overflow-y-auto">
            {n.isPending ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : !n.data?.items.length ? (
              <EmptyState icon={<Bell className="size-5" />} title="You’re all caught up" body="Assignments and updates on your tasks appear here." />
            ) : (
              <ul className="divide-y divide-line">
                {n.data.items.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => {
                        close();
                        if (!item.readAt) markRead([item.id]);
                        if (item.taskId) openTask(item.taskId);
                      }}
                      className={cx('flex w-full gap-3 px-4 py-3 text-left hover:bg-subtle', !item.readAt && 'bg-accent-soft/40')}
                    >
                      <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', item.readAt ? 'bg-transparent' : item.type === 'urgent' ? 'bg-urgent' : 'bg-accent')} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] leading-snug text-ink">{item.message}</span>
                        <span className="mt-0.5 block text-xs text-ink-3">{relative(item.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </Popover>
  );
}
