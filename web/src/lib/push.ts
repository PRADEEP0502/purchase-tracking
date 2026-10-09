import { api } from './api';

/**
 * Push alerts via Firebase Cloud Messaging — lets phones ring even when the app is closed.
 * The web config below is public by design (it identifies the Firebase project; it is not a secret).
 * The server decides whether push is enabled (it holds the private service-account key).
 * Firebase is loaded only when push is turned on, so it does not slow down the app.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyDvcpPK59CJhHHO5_-brGJl7nM6M1bQxTA',
  authDomain: 'jpm-f637c.firebaseapp.com',
  projectId: 'jpm-f637c',
  storageBucket: 'jpm-f637c.firebasestorage.app',
  messagingSenderId: '1079660016941',
  appId: '1:1079660016941:web:a7e7bb631c93249c0c0fa4',
};

const TOKEN_KEY = 'jpm-push-token';

export type PushState = 'on' | 'off' | 'not-configured' | 'unsupported' | 'denied';

const store = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (v: string | null) => {
    try {
      if (v) localStorage.setItem(TOKEN_KEY, v);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function messaging() {
  const [{ initializeApp, getApps }, m] = await Promise.all([import('firebase/app'), import('firebase/messaging')]);
  if (!(await m.isSupported())) return null;
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  return { ...m, instance: m.getMessaging(app) };
}

/** Current state for this device, without prompting the user. */
export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const { data } = await api.get<{ enabled: boolean }>('/push/config');
  if (!data.enabled) return 'not-configured';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' && store.get() ? 'on' : 'off';
}

/**
 * Registers this device for push. Only asks for notification permission when `prompt` is true
 * (call it from a button tap — browsers require a user gesture). Safe to call on every start:
 * it refreshes the token, which Firebase rotates from time to time.
 */
export async function enablePush(prompt = false): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const { data: cfg } = await api.get<{ enabled: boolean; vapidKey: string | null }>('/push/config');
  if (!cfg.enabled || !cfg.vapidKey) return 'not-configured';

  let permission = Notification.permission;
  if (permission === 'default' && prompt) permission = await Notification.requestPermission();
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'off';

  const m = await messaging();
  if (!m) return 'unsupported';
  const registration = (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  const token = await m.getToken(m.instance, { vapidKey: cfg.vapidKey, serviceWorkerRegistration: registration });
  if (!token) return 'off';
  await api.post('/push/subscribe', { token });
  store.set(token);
  return 'on';
}

/** On sign-out: stop this device receiving the signed-out user's alerts. */
export async function disablePush(): Promise<void> {
  const token = store.get();
  if (!token) return;
  store.set(null);
  try {
    await api.post('/push/unsubscribe', { token });
    const m = await messaging();
    if (m) await m.deleteToken(m.instance);
  } catch {
    /* best effort */
  }
}
