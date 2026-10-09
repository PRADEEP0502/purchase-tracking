/*
 * JPM Purchase service worker.
 *  - Makes the app installable and open instantly (cached app shell).
 *  - Never caches /api: task data is always live.
 *  - Shows notifications in the phone's notification bar and opens the task on tap.
 *  - Has a `push` handler ready for Web Push (server-sent alerts while the app is closed).
 */
const VERSION = 'jpm-v2';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/theme.js', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Pages: network first so new versions load; cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Built assets have content hashes in their names: cache first is safe.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || /\.(svg|png|webmanifest|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

/** Tap on a notification → focus the app (or open it) on that task. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const taskId = event.notification.data && event.notification.data.taskId;
  const target = taskId ? `/?task=${taskId}` : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (win) {
        win.postMessage({ type: 'open-task', taskId });
        return win.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});

/**
 * Push alerts (Firebase Cloud Messaging data messages: { data: { title, body, taskId, level, kind } }).
 * Arrive even when the app is closed. When the app is open and in front, its own in-app alert
 * (sound + card) is enough, so no second notification is shown.
 */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'JPM Purchase', body: event.data && event.data.text() };
  }
  const data = payload.data || payload;
  const taskId = data.taskId ? Number(data.taskId) : undefined;
  const urgent = data.level === 'urgent';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      if (wins.some((w) => w.focused && w.visibilityState === 'visible')) return undefined;
      return self.registration.showNotification(data.title || 'JPM Purchase', {
        body: data.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        // Same task → replaces the earlier notification instead of stacking.
        tag: taskId ? `jpm-task-${taskId}` : undefined,
        renotify: true,
        requireInteraction: urgent,
        vibrate: urgent ? [400, 150, 400, 150, 400] : [200, 100, 200],
        data: { taskId },
      });
    }),
  );
});
