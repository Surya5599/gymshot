/* GymShot service worker. Its jobs: receive web pushes and show them, let
   the page show system notifications (Android Chrome requires a worker for
   that), and bring the app to the front on the right tab when one is
   tapped. No caching - the app is always online, so an offline cache would
   only serve stale builds. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Safari revokes a push subscription that receives pushes without showing a
// notification, so there every push is shown. Elsewhere a push is dropped
// while the app is open and focused: the in-app toast already announced it.
const isAppleWebKit = /AppleWebKit/.test(self.navigator.userAgent) && !/Chrome|Chromium|Android/.test(self.navigator.userAgent);

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: event.data ? event.data.text() : 'GymShot' };
  }
  event.waitUntil(
    (async () => {
      if (!isAppleWebKit) {
        const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        if (all.some((c) => c.visibilityState === 'visible' && c.focused)) return;
      }
      await self.registration.showNotification(data.title || 'GymShot', {
        body: data.body,
        icon: '/icon-192.png',
        badge: '/favicon.png',
        tag: data.tag,
        data: { tab: data.tab || 'today' },
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const tab = (event.notification.data && event.notification.data.tab) || 'today';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          client.postMessage({ type: 'open-tab', tab });
          return client.focus();
        }
      }
      return self.clients.openWindow('/?tab=' + encodeURIComponent(tab));
    })()
  );
});
