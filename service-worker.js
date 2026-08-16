// UNO DOS IDOSOS — service worker seguro e leve.
// Não cacheia HTML, JS, CSS, API ou Socket.IO para evitar versões presas.
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {});
