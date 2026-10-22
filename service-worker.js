// Installable app shell without a second data/asset cache. Online data stays authoritative.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// No fetch interception, CacheStorage or authentication persistence.
