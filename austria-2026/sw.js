var V="aut26-v1",TILES="aut26-tiles";
var SHELL=["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png","./apple-touch-icon.png"];
self.addEventListener("install",function(e){e.waitUntil(caches.open(V).then(function(c){return c.addAll(SHELL)}).then(function(){return self.skipWaiting()}))});
self.addEventListener("activate",function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==V&&k!==TILES}).map(function(k){return caches.delete(k)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener("fetch",function(e){
  var r=e.request;if(r.method!=="GET")return;var u=new URL(r.url);
  if(u.hostname==="tile.openstreetmap.org"){
    e.respondWith(caches.open(TILES).then(function(c){return c.match(r).then(function(h){
      var n=fetch(r).then(function(x){if(x&&(x.ok||x.type==="opaque"))c.put(r,x.clone());return x}).catch(function(){return h});
      return h||n})}));return}
  if(u.origin===location.origin){
    e.respondWith(caches.match(r,{ignoreSearch:true}).then(function(h){
      var n=fetch(r).then(function(x){if(x&&x.ok)caches.open(V).then(function(c){c.put(r,x.clone())});return x}).catch(function(){return h||caches.match("./index.html")});
      return h||n}))}});
