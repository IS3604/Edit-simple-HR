/* EditSimple HR service worker — web push notifications. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = windows.some((c) => c.visibilityState === 'visible' && c.focused);
    // Tell open tabs first (they play the EditSimple chime + refresh), so this works
    // even if the OS notification can't be shown.
    windows.forEach((c) => c.postMessage({ type: 'es-push', title: data.title, body: data.body, url: data.url }));
    try {
      await self.registration.showNotification(data.title || 'EditSimple HR', {
        body: data.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        tag: data.tag,
        renotify: Boolean(data.tag),
        silent: visible, // the open tab plays the custom chime instead of the OS sound
        requireInteraction: Boolean(data.url && data.url.startsWith('/requests')),
        data: { url: data.url || '/' },
      });
    } catch (err) {
      console.error('[sw] showNotification failed', err);
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of windows) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus();
        if ('navigate' in c) await c.navigate(url);
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});

// If the browser rotates the subscription, ask open tabs to re-save it.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((ws) => ws.forEach((c) => c.postMessage({ type: 'es-resubscribe' }))));
});
