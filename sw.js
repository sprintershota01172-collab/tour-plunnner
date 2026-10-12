const CACHE='tabi-planner-v56';
const SHELL=['./index.html','./styles.css?v=20261012-44','./app.js?v=20261012-44','./date-range.js?v=20261012-44','./sync.js?v=20261012-41','./manifest.webmanifest?v=20261012-41','./icon.svg?v=20261012-41','./icon-192.png?v=20261012-41','./icon-512.png?v=20261012-41','./apple-touch-icon.png?v=20261012-41'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('tabi-planner-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.includes('/api/')||url.pathname.endsWith('/mobile-check.html')||url.pathname.endsWith('/icon-preview.html'))return;
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE),page=new URL('./index.html',self.registration.scope);
      try{const response=await fetch(new Request(page,{cache:'reload'}));if(response.ok&&response.type==='basic')await cache.put(page,response.clone());return response;}
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
