const CACHE='uno-dos-idosos-v3';
const CORE=['/','/index.html','/style.css','/app.js'];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(CORE).catch(()=>{}))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;

  // HTML e JavaScript/CSS sempre tentam a versão nova primeiro.
  // Isso evita o celular ficar preso em uma versão quebrada do jogo.
  const fresh=url.pathname==='/' || url.pathname==='/index.html' || url.pathname==='/app.js' || url.pathname==='/style.css' || url.pathname==='/service-worker.js';
  if(fresh){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(response=>{
          if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
          return response;
        })
        .catch(()=>caches.match(event.request).then(hit=>hit || caches.match('/index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(hit=>hit || fetch(event.request).then(response=>{
        if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
        return response;
      }).catch(()=>hit))
  );
});
