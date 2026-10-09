import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { BellRing, CalendarDays, Check, Siren, X } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import {
  ALERT_KINDS,
  alertTitle,
  desktopPermission,
  desktopPromptDismissed,
  dismissDesktopPrompt,
  installAudioUnlock,
  playAlertSound,
  requestDesktopPermission,
  showDesktopNotification,
  vibrateFor,
  type LiveAlert,
} from '../lib/alerts';
import { cx, fmtDateOnly, relative } from '../lib/format';
import { useDashboard, useInvalidateTasks } from '../lib/queries';
import { useInstall } from '../lib/pwa';
import { enablePush } from '../lib/push';
import { installDismissed } from './InstallPrompt';
import { useAppState } from './app-state';
import { ActionBadge, PriorityBadge, StructurePath } from './task-bits';
import { Button, IconButton } from './ui';

const MAX_CARDS = 3;
/** Normal-priority cards fade out on their own; high/urgent stay until handled. */
const NORMAL_CARD_MS = 15_000;

function AlertCard({ alert, onDismiss }: { alert: LiveAlert; onDismiss: () => void }) {
  const { openTask } = useAppState();
  const invalidate = useInvalidateTasks();
  const [busy, setBusy] = useState(false);
  const d = alert.data;
  const urgent = alert.level === 'urgent';
  // Assignment alerts and reminders go only to the assignee, so they can be acknowledged here.
  const canAck = alert.kind === 'assigned' || alert.kind === 'reminder';

  const acknowledge = async () => {
    setBusy(true);
    try {
      await api.post(`/tasks/${alert.taskId}/acknowledge`);
      invalidate(alert.taskId);
      toast.success('Marked as received');
      onDismiss();
    } catch (e) {
      toast.error(errorMessage(e, 'Unable to mark as received. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="alert"
      className={cx(
        'pointer-events-auto w-full overflow-hidden rounded-lg border bg-surface shadow-xl animate-panel',
        urgent ? 'border-urgent/50' : alert.level === 'high' ? 'border-high/40' : 'border-line',
      )}
    >
      <div className={cx('flex items-center gap-2 px-3.5 py-2 text-[13px] font-semibold', urgent ? 'bg-urgent text-white' : alert.level === 'high' ? 'bg-high-soft text-high' : 'bg-accent-soft text-accent')}>
        {urgent ? <Siren className="size-4" /> : <BellRing className="size-4" />}
        <span className="flex-1">{alertTitle(alert)}</span>
        <span className={cx('text-[11px] font-normal', urgent ? 'text-white/80' : 'opacity-70')}>{relative(alert.createdAt)}</span>
        <button type="button" aria-label="Dismiss alert" onClick={onDismiss} className="-mr-1 rounded p-0.5 opacity-80 hover:opacity-100">
          <X className="size-4" />
        </button>
      </div>
      <div className="space-y-1.5 px-3.5 py-3">
        {(!!d.action || !!d.structurePath?.length) && (
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <ActionBadge name={d.action} />
            <StructurePath path={d.structurePath ?? []} />
          </div>
        )}
        <p className="text-[15px] leading-snug font-semibold text-ink">{d.label ?? d.title ?? alert.message}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
          {d.priority && <PriorityBadge priority={d.priority} />}
          {d.assignedBy && <span>Assigned by {d.assignedBy}</span>}
          {d.dueDate && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" /> Due {fmtDateOnly(d.dueDate)}
            </span>
          )}
          {alert.kind === 'reminder' && d.reminder && <span>Reminder {d.reminder}{d.maxReminders ? ` of ${d.maxReminders}` : ''}</span>}
        </div>
      </div>
      <div className="flex gap-2 border-t border-line bg-canvas/60 px-3.5 py-2.5">
        <Button
          size="sm"
          onClick={() => {
            openTask(alert.taskId);
            if (!canAck) onDismiss();
          }}
        >
          Open task
        </Button>
        {canAck && (
          <Button size="sm" variant={urgent ? 'danger' : 'primary'} loading={busy} icon={<Check className="size-3.5" />} onClick={acknowledge}>
            Received
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Listens for live notifications and raises the alarm: sound (when the browser allows),
 * an OS notification when the tab is in the background, and a persistent in-app card.
 */
export function AlertCenter() {
  const { openTask, taskId: openTaskId } = useAppState();
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const [permission, setPermission] = useState(desktopPermission());
  const [showPrompt, setShowPrompt] = useState(!desktopPromptDismissed());
  // On phones, one prompt at a time: the install banner first, then the alerts prompt.
  const install = useInstall();
  const [installBannerGone, setInstallBannerGone] = useState(installDismissed);
  useEffect(() => {
    const onGone = () => setInstallBannerGone(true);
    window.addEventListener('jpm:install-dismissed', onGone);
    return () => window.removeEventListener('jpm:install-dismissed', onGone);
  }, []);
  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
  const installBannerShowing = phone && !installBannerGone && (install.canPrompt || install.iosManual);

  const dismiss = useCallback((taskId: number) => setAlerts((list) => list.filter((a) => a.taskId !== taskId)), []);

  useEffect(() => installAudioUnlock(), []);

  // Already allowed notifications on this device → (re)register for push alerts.
  useEffect(() => {
    if (desktopPermission() === 'granted') enablePush(false).catch(() => undefined);
  }, []);

  useEffect(() => {
    const onAlert = (e: Event) => {
      const alert = (e as CustomEvent<LiveAlert>).detail;
      if (!ALERT_KINDS.has(alert.kind)) return;
      // One card per task: a reminder replaces the earlier alert.
      setAlerts((list) => [alert, ...list.filter((a) => a.taskId !== alert.taskId)]);
      playAlertSound(alert.level);
      vibrateFor(alert.level);
      if (document.visibilityState !== 'visible' || !document.hasFocus()) {
        showDesktopNotification(alert, () => openTask(alert.taskId));
      }
      if (alert.level === 'normal') window.setTimeout(() => setAlerts((list) => list.filter((a) => a !== alert)), NORMAL_CARD_MS);
    };
    // Acknowledged/closed/reassigned elsewhere → stop alerting for that task.
    const onCleared = (e: Event) => dismiss((e as CustomEvent<{ taskId: number }>).detail.taskId);
    // Tap on a notification in the phone's notification bar → open that task here.
    const onSwMessage = (e: MessageEvent) => {
      if (e.data?.type === 'open-task' && e.data.taskId) openTask(Number(e.data.taskId));
    };
    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    window.addEventListener('jpm:alert', onAlert);
    window.addEventListener('jpm:alerts-cleared', onCleared);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
      window.removeEventListener('jpm:alert', onAlert);
      window.removeEventListener('jpm:alerts-cleared', onCleared);
    };
  }, [dismiss, openTask]);

  const enableDesktop = async () => {
    const result = await requestDesktopPermission();
    setPermission(result);
    setShowPrompt(false);
    dismissDesktopPrompt();
    if (result === 'granted') {
      enablePush(false).catch(() => undefined);
      toast.success('Task alerts turned on');
      playAlertSound('normal', true);
    } else if (result === 'denied') {
      toast.error('Notifications are blocked. Allow them in your browser’s site settings.');
    }
  };

  // The task already open in the panel shows its own acknowledge banner — no duplicate card.
  const visible = alerts.filter((a) => a.taskId !== openTaskId).slice(0, MAX_CARDS);

  return (
    <>
      {visible.length > 0 && (
        <div
          className={cx(
            'pointer-events-none fixed top-[calc(60px+env(safe-area-inset-top))] right-3 left-3 z-[45] flex flex-col gap-2 sm:left-auto sm:w-[360px]',
            // Sit beside the task panel instead of covering it on wide screens.
            !!openTaskId && 'lg:right-[492px]',
          )}
        >
          {visible.map((a) => (
            <AlertCard key={`${a.taskId}-${a.notificationId}`} alert={a} onDismiss={() => dismiss(a.taskId)} />
          ))}
          {alerts.length > visible.length && visible.length === MAX_CARDS && (
            <button onClick={() => setAlerts(visible)} className="pointer-events-auto self-end rounded-md bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 shadow">
              +{alerts.length - MAX_CARDS} more · hide older
            </button>
          )}
        </div>
      )}

      {showPrompt && permission === 'default' && !installBannerShowing && (
        <div className="fixed bottom-[calc(140px+env(safe-area-inset-bottom))] left-3 z-30 w-[calc(100%-1.5rem)] max-w-sm rounded-lg border border-line bg-surface p-4 shadow-xl animate-in md:bottom-4 md:left-4">
          <div className="flex gap-3">
            <BellRing className="mt-0.5 size-5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Turn on task alerts</p>
              <p className="mt-0.5 text-[13px] text-ink-2">Get notified the moment a task is assigned to you, even when the app is in the background.</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="primary" onClick={enableDesktop}>
                  Turn on
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    dismissDesktopPrompt();
                    setShowPrompt(false);
                  }}
                >
                  Not now
                </Button>
              </div>
            </div>
            <IconButton
              label="Close"
              className="-mt-1 -mr-2 size-7"
              onClick={() => {
                dismissDesktopPrompt();
                setShowPrompt(false);
              }}
            >
              <X className="size-4" />
            </IconButton>
          </div>
        </div>
      )}
    </>
  );
}

/** Slim, persistent reminder of assignments still waiting for this user's acknowledgement. */
export function AwaitingAckBar() {
  const dash = useDashboard();
  const n = dash.data?.counts.awaitingAck ?? 0;
  if (!n) return null;
  return (
    <Link
      to="/my?tab=ack"
      className="flex items-center gap-2 border-b border-high/30 bg-high-soft px-4 py-2 text-[13px] font-medium text-ink hover:brightness-[0.98] sm:px-5"
    >
      <BellRing className="size-4 text-high" />
      <span className="flex-1">
        {n} new task{n === 1 ? '' : 's'} not yet marked as received
      </span>
      <span className="text-high">Review →</span>
    </Link>
  );
}
