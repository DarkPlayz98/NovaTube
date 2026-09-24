const CACHE="novatube-shell-v1";
const ASSETS=["/","/index.html","/icon.svg","/manifest.webmanifest","/src/ui-overrides.css"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("fetch",event=>{
  const u=new URL(event.request.url);
  if(u.origin!==location.origin || event.request.method!=="GET") return;
  event.respondWith(
    caches.match(event.request).then(cached=>cached||fetch(event.request).then(res=>{
      const copy=res.clone(); caches.open(CACHE).then(c=>c.put(event.request,copy)); return res;
    }).catch(()=>caches.match("/index.html")))
  );
});