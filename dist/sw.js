const CACHE='tabi-planner-v110';
const SHELL=['./flight-mark.svg?v=20261018-110','./invite-card-art.svg?v=20261018-110','./mobile-input.js?v=20261018-110','./line-share.html','./line-share.js?v=20261018-110','./line-invite.js?v=20261018-110','./index.html','./styles.css?v=20261018-110','./i18n.js?v=20261018-110','./app.js?v=20261018-110','./notifications.js?v=20261018-110','./date-range.js?v=20261018-110','./sync.js?v=20261018-110','./accounts.js?v=20261018-110','./account-ui.js?v=20261018-110','./account.css?v=20261018-110','./manifest.webmanifest?v=20261012-41','./icon.svg?v=20261012-41','./icon-192.png?v=20261012-41','./icon-512.png?v=20261012-41','./apple-touch-icon.png?v=20261012-41'];
// Only the essential offline app must succeed for activation. Optional image
// files cannot make the whole offline installation fail.
const OPTIONAL=SHELL.filter(file=>/flight-mark\.svg|invite-card-art\.svg|line-share\.html|line-share\.js|manifest\.webmanifest|icon\.svg|icon-192\.png|icon-512\.png|apple-touch-icon\.png/.test(file));
const CORE=SHELL.filter(file=>!OPTIONAL.includes(file));
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(CORE);
  await Promise.allSettled(OPTIONAL.map(file=>cache.add(file)));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('tabi-planner-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
// Prefer the locally installed app shell. Waiting for the network on each
// navigation made an already-installed app slow and unusable without signal.
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||
     url.pathname.includes('/api/')||url.pathname.endsWith('/mobile-check.html')||
     url.pathname.endsWith('/icon-preview.html')||url.pathname.endsWith('/line-config.json'))return;
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      const page=new URL(url.pathname.endsWith('/line-share.html')?'./line-share.html':'./index.html',self.registration.scope);
      const local=await cache.match(page);
      if(local)return local; // Instant start, even while offline.
      try{
        const response=await fetch(request);
        if(response.ok&&response.type==='basic'){
          await cache.put(page,response.clone());
        }
        return response;
      }catch{return (await cache.match('./index.html'))||Response.error();}
    })());
    return;
  }
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),cached=await cache.match(request);
    if(cached)return cached;
    try{
      const response=await fetch(request);
      if(response.ok&&response.type==='basic')await cache.put(request,response.clone());
      return response;
    }catch{return Response.error();}
  })());
});

self.addEventListener('push',event=>event.waitUntil((async()=>{
  let content={title:'tabi',body:'パートナーが旅行を更新しました。タップして確認できます。',tag:'tabi-partner-update'};
  try{const payload=event.data?.json();if(payload?.web_push===8030&&payload.notification){const n=payload.notification;if(typeof n.title==='string')content.title=n.title.slice(0,80);if(typeof n.body==='string')content.body=n.body.slice(0,300);if(n.tag==='tabi-notification-test')content.tag=n.tag;}}catch{}
  // Foreground refresh and system notification should run concurrently.
  await Promise.all([
    self.registration.showNotification(content.title,{body:content.body,icon:new URL('./icon-192.png',self.registration.scope).href,badge:new URL('./icon-192.png',self.registration.scope).href,tag:content.tag,data:{url:self.registration.scope}}),
    (async()=>{
      const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
      for(const client of windows)if(client.url.startsWith(self.registration.scope))client.postMessage({type:'tabi-partner-update'});
    })()
  ]);
})()));
self.addEventListener('notificationclick',event=>{
  event.notification.close();event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const client=windows.find(c=>c.url.startsWith(self.registration.scope));
    if(client){await client.focus();client.postMessage({type:'tabi-partner-update'});}else await self.clients.openWindow(self.registration.scope);
  })());
});
