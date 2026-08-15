const CACHE="unovelho-matx-v8";
const CORE=["/","/index.html","/style.css","/app.js","/assets/manifest.json","/assets/audio/matematixa-theme.wav","/assets/reference-arena.jpg","/assets/reference-cards.jpg","/assets/reference-lobby.jpg"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE).catch(()=>{})).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{if(e.request.method!=="GET"||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return res;}).catch(()=>caches.match("/index.html"))));});
