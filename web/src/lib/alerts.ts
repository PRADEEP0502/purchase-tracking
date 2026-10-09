import type { AlertData, AlertLevel } from './types';

/**
 * Client side of assignment alerts: a short synthesized chime (no audio files) and
 * browser notifications. Nothing loops here — repeated reminders come from the server,
 * so alarms stop as soon as the task is acknowledged anywhere.
 *
 * Browsers only allow audio after the user has interacted with the page, so the audio
 * context is unlocked on the first click/key press. If sound is blocked, the visual alert
 * is still shown.
 */

export interface LiveAlert {
  notificationId: number;
  taskId: number;
  kind: string;
  level: AlertLevel;
  message: string;
  data: AlertData;
  createdAt: string;
}

/** Notification kinds that represent work waiting on the user (and therefore alert). */
export const ALERT_KINDS = new Set(['assigned', 'reminder', 'due', 'overdue', 'urgent']);

// ---------------------------------------------------------------------------
// Preferences (per browser)
// ---------------------------------------------------------------------------

const SOUND_KEY = 'jpm-alert-sound';
const PROMPT_KEY = 'jpm-desktop-alerts-dismissed';

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

export const soundEnabled = () => read(SOUND_KEY) !== 'off';
export const setSoundEnabled = (on: boolean) => write(SOUND_KEY, on ? null : 'off');
export const desktopPromptDismissed = () => read(PROMPT_KEY) === '1';
export const dismissDesktopPrompt = () => write(PROMPT_KEY, '1');

// ---------------------------------------------------------------------------
// Sound
// ---------------------------------------------------------------------------

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

/** Call once at startup: unlocks audio on the first user gesture (autoplay policy). */
export function installAudioUnlock(): () => void {
  const unlock = () => {
    const a = audio();
    if (a && a.state === 'suspended') a.resume().catch(() => undefined);
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
}

function tone(a: AudioContext, freq: number, start: number, length: number, volume: number, type: OscillatorType) {
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(a.destination);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

/**
 * Plays a short alert. normal: soft single chime · high: two-tone chime ·
 * urgent: three stronger two-tone pulses (~1.6 s). Returns false if the browser blocked audio.
 */
export function playAlertSound(level: AlertLevel, force = false): boolean {
  if (!force && !soundEnabled()) return false;
  const a = audio();
  if (!a || a.state !== 'running') return false;
  const t = a.currentTime + 0.02;
  if (level === 'urgent') {
    for (let i = 0; i < 3; i++) {
      tone(a, 988, t + i * 0.55, 0.22, 0.32, 'triangle');
      tone(a, 1319, t + i * 0.55 + 0.2, 0.28, 0.32, 'triangle');
    }
  } else if (level === 'high') {
    tone(a, 784, t, 0.3, 0.22, 'sine');
    tone(a, 1175, t + 0.18, 0.45, 0.22, 'sine');
  } else {
    tone(a, 880, t, 0.5, 0.14, 'sine');
  }
  return true;
}

// ---------------------------------------------------------------------------
// Browser notifications
// ---------------------------------------------------------------------------

export const desktopSupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const desktopPermission = (): NotificationPermission | 'unsupported' => (desktopSupported() ? Notification.permission : 'unsupported');

export async function requestDesktopPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!desktopSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function alertTitle(alert: Pick<LiveAlert, 'kind' | 'level'>): string {
  switch (alert.kind) {
    case 'assigned':
      return alert.level === 'urgent' ? 'Urgent task assigned' : 'New task assigned';
    case 'reminder':
      return 'Reminder: urgent task not received';
    case 'due':
      return 'Task due today';
    case 'overdue':
      return 'Task overdue';
    case 'urgent':
      return 'Urgent task';
    default:
      return 'JPM Purchase';
  }
}

/** Short vibration for high/urgent alerts on phones (ignored where unsupported). */
export function vibrateFor(level: AlertLevel): void {
  if (!soundEnabled() || typeof navigator.vibrate !== 'function') return;
  try {
    if (level === 'urgent') navigator.vibrate([400, 150, 400, 150, 400]);
    else if (level === 'high') navigator.vibrate([200, 100, 200]);
  } catch {
    /* ignore */
  }
}

/**
 * Shows a notification in the OS notification bar when permitted. Used when the app is not in focus.
 * Goes through the service worker when installed (required on Android; tapping opens the task).
 */
export function showDesktopNotification(alert: LiveAlert, onClick: () => void): void {
  if (desktopPermission() !== 'granted') return;
  const d = alert.data;
  const lines = [
    d.label ?? d.title ?? alert.message,
    [d.structurePath?.join(' › '), d.action].filter(Boolean).join(' · '),
    d.assignedBy ? `Assigned by ${d.assignedBy}` : '',
  ].filter(Boolean);
  const title = `${alert.level === 'urgent' ? '🚨' : '🔔'} ${alertTitle(alert)}`;
  const options: NotificationOptions & { vibrate?: number[] } = {
    body: lines.join('\n'),
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // Same task → replace instead of stacking.
    tag: `jpm-task-${alert.taskId}`,
    requireInteraction: alert.level === 'urgent',
    data: { taskId: alert.taskId },
    vibrate: alert.level === 'urgent' ? [400, 150, 400, 150, 400] : [200, 100, 200],
  };
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, options)).catch(() => undefined);
    return;
  }
  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      onClick();
      n.close();
    };
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}
