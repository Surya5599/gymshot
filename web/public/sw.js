/* GymShot service worker. Its only jobs: let the page show system
   notifications (Android Chrome requires a worker for that), and bring the
   app to the front on the right tab when one is tapped. No caching - the
   app is always online, so an offline cache would only serve stale builds. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
