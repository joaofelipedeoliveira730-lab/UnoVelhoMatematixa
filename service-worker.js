// UNO VELHO MATEMATIXA 5.3 — SW neutro; recursos sempre vêm da rede.
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.registration.unregister().then(()=>self.clients.claim())));
self.addEventListener('fetch', () => {});
