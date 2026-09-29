import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Subscribes to server-sent events. Events carry only IDs; affected queries are
 * re-fetched through the normal authorised API, so the UI updates without a manual refresh.
 */
export function useLiveUpdates(enabled: boolean) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    let es: EventSource | null = null;
    let retry: number | undefined;
    let pending = new Set<string>();
    let flushTimer: number | undefined;

    // Coalesce bursts (e.g. several uploads) into one refetch.
    const schedule = (key: string) => {
      pending.add(key);
      window.clearTimeout(flushTimer);
      flushTimer = window.setTimeout(() => {
        const keys = pending;
        pending = new Set();
        keys.forEach((k) => qc.invalidateQueries({ queryKey: JSON.parse(k) }));
      }, 150);
    };

    const connect = () => {
      es = new EventSource('/api/events');
      const onTask = (e: MessageEvent) => {
        const { taskId } = JSON.parse(e.data);
        ['tasks', 'dashboard', 'sections'].forEach((k) => schedule(JSON.stringify([k])));
        schedule(JSON.stringify(['task', taskId]));
        schedule(JSON.stringify(['activity', taskId]));
      };
      es.addEventListener('task.changed', onTask);
      es.addEventListener('task.deleted', onTask);
      es.addEventListener('task.thread', (e) => {
        const { taskId } = JSON.parse((e as MessageEvent).data);
        schedule(JSON.stringify(['thread', taskId]));
        schedule(JSON.stringify(['task', taskId]));
        schedule(JSON.stringify(['activity', taskId]));
        schedule(JSON.stringify(['tasks']));
      });
      es.addEventListener('sections.changed', () => schedule(JSON.stringify(['sections'])));
      es.addEventListener('notification', () => schedule(JSON.stringify(['notifications'])));
      es.onerror = () => {
        // Browser retries automatically; if the connection is closed (e.g. session expired), back off and reconnect.
        if (es?.readyState === EventSource.CLOSED) {
          es.close();
          retry = window.setTimeout(connect, 10_000);
        }
      };
    };
    connect();

    // Catch up after the tab was in the background.
    const onVisible = () => {
      if (document.visibilityState === 'visible') qc.invalidateQueries({ queryKey: ['notifications'] });
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      es?.close();
      window.clearTimeout(retry);
      window.clearTimeout(flushTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, qc]);
}
