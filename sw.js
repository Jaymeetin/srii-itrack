/* SRII i-TRACK app shell cache v2: assets only, always prefer the network. */
const CACHE_NAME="srii-itrack-account-management-v37";
const CORE_ASSETS=[
 "./","./index.html","./styles.css","./mobile.css",
 "./app.js","./mobile-shell.js","./upload-ui.css","./upload-ui.js","./download-ui.js","./config.js",
 "./manifest.webmanifest","./SRII_iTRACK_3sec_Portrait_Opening_Preview.mp4","./assets/srii-itrack-official-logo.png","./assets/srii-itrack-logo-optimized.webp",
 "./assets/srii-itrack-icon-192.png","./assets/srii-itrack-icon-512.png",
 "./assets/srii-itrack-icon-180.png","./assets/srii-itrack-icon-48.png"
];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE_NAME)
  .then(cache=>cache.addAll(CORE_ASSETS))
  .then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
 event.waitUntil(
  caches.keys()
   .then(names=>Promise.all(names.filter(name=>name.startsWith("srii-itrack-")&&name!==CACHE_NAME).map(name=>caches.delete(name))))
   .then(()=>self.clients.claim())
 );
});
self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET")return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 event.respondWith(
  fetch(event.request).then(response=>{
   if(response.ok&&response.type==="basic"){
    const copy=response.clone();
    event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy)));
   }
   return response;
  }).catch(()=>caches.match(event.request))
 );
});
