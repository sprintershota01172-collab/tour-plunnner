const CACHE='tabi-planner-v99';
const SHELL=['./flight-mark.svg?v=20261017-99','./invite-card-art.svg?v=20261017-99','./mobile-input.js?v=20261017-99','./line-share.html','./line-share.js?v=20261017-99','./line-invite.js?v=20261017-99','./index.html','./styles.css?v=20261017-99','./i18n.js?v=20261017-99','./app.js?v=20261017-99','./notifications.js?v=20261017-99','./date-range.js?v=20261017-99','./sync.js?v=20261017-99','./accounts.js?v=20261017-99','./account-ui.js?v=20261017-99','./account.css?v=20261017-99','./manifest.webmanifest?v=20261012-41','./icon.svg?v=20261012-41','./icon-192.png?v=20261012-41','./icon-512.png?v=20261012-41','./apple-touch-icon.png?v=20261012-41'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('tabi-planner-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.includes('/api/')||url.pathname.endsWith('/mobile-check.html')||url.pathname.endsWith('/icon-preview.html')||url.pathname.endsWith('/line-config.json'))return;
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE),page=new URL(url.pathname.endsWith('/line-share.html')?'./line-share.html':'./index.html',self.registration.scope);
      try{const response=await fetch(new Request(request,{cache:'reload'}));if(response.ok&&response.type==='basic')await cache.put(page,response.clone());return response;}
      catch{return(await cache.match(page))||Response.error();}
    })());
    return;
  }
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),cached=await cache.match(request);
    if(cached)return cached;
    try{const response=await fetch(request);if(response.ok&&response.type==='basic')await cache.put(request,response.clone());return response;}
    catch{if(request.mode==='navigate')return (await cache.match('./index.html'))||Response.error();return Response.error();}
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
