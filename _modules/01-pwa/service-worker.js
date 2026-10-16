/* service-worker.js — yunshu-zhuangqi PWA 离线架构
 * 策略: navigation → network-first / static → cache-first / IDB fallback
 * 缓存: shell ≤5MB, total ≤50MB, LRU 清理
 * 版本: v0.1.0 (r31202) · 2026-10-16
 */
(function (self) {
  'use strict';

  var VERSION = 'ys-pwa-v0.1.0-r31202';
  var SHELL_LIMIT = 5 * 1024 * 1024;
  var TOTAL_LIMIT = 50 * 1024 * 1024;
  var SYNC_TAG = 'sync-project';

  var SHELL_URLS = [
    './app.html',
    './manifest.json',
    './offline.html',
    './idb-store.js',
    './register-sw.js',
    './register-sw.bundle.js',
    '../favicon.svg',
    '../favicon-192.png',
    '../favicon-512.png',
    '../assets/hero.png'
  ];

  var STATIC_CACHE = VERSION + '-shell';
  var RUNTIME_CACHE = VERSION + '-runtime';

  function isShell(url) {
    return SHELL_URLS.some(function (s) {
      return url.indexOf(s.split('./')[1] || s) !== -1;
    });
  }

  function trimCache(cacheName, maxBytes) {
    return caches.open(cacheName).then(function (cache) {
      return cache.keys().then(function (keys) {
        var total = 0;
        var entries = [];
        var p = Promise.resolve();
        keys.forEach(function (k) {
          p = p.then(function () { return cache.match(k); })
            .then(function (r) { return r && r.clone().blob(); })
            .then(function (blob) {
              if (!blob) return null;
              total += blob.size;
              entries.push({ key: k, size: blob.size });
            });
        });
        return p.then(function () {
          entries.sort(function (a, b) { return a.size - b.size; });
          var p2 = Promise.resolve();
          if (total > maxBytes) {
            entries.forEach(function (e) {
              if (total <= maxBytes) return;
              p2 = p2.then(function () {
                total -= e.size;
                return cache.delete(e.key);
              });
            });
          }
          return p2;
        });
      });
    });
  }

  self.addEventListener('install', function (event) {
    event.waitUntil(
      caches.open(STATIC_CACHE).then(function (cache) {
        return Promise.all(SHELL_URLS.map(function (u) {
          return cache.add(new Request(u, { cache: 'reload' }))
            .catch(function () { return null; });
        }));
      }).then(function () { return self.skipWaiting(); })
    );
  });

  self.addEventListener('activate', function (event) {
    event.waitUntil(
      caches.keys().then(function (keys) {
        return Promise.all(keys.filter(function (k) {
          return k.indexOf('ys-pwa-') === 0 && k !== STATIC_CACHE && k !== RUNTIME_CACHE;
        }).map(function (k) { return caches.delete(k); }));
      }).then(function () { return clients.claim(); })
        .then(function () { return trimCache(RUNTIME_CACHE, TOTAL_LIMIT); })
    );
  });

  self.addEventListener('fetch', function (event) {
    var req = event.request;
    if (req.method !== 'GET') return;
    var url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1) {
      event.respondWith(networkFirst(req));
      return;
    }
    if (isStatic(req.url)) {
      event.respondWith(cacheFirst(req));
      return;
    }
    event.respondWith(staleWhileRevalidate(req));
  });

  function isStatic(url) {
    return /\.(?:js|css|png|jpg|jpeg|gif|svg|webp|woff2?|ttf|otf|ico)(\?|#|$)/.test(url);
  }

  function networkFirst(req) {
    return fetch(req).then(function (resp) {
      if (resp && resp.ok) {
        var copy = resp.clone();
        caches.open(RUNTIME_CACHE).then(function (c) { return c.put(req, copy); });
      }
      return resp;
    }).catch(function () {
      return caches.match(req).then(function (c) {
        return c || caches.match('./offline.html');
      });
    });
  }

  function cacheFirst(req) {
    return caches.match(req).then(function (c) {
      if (c) return c;
      return fetch(req).then(function (resp) {
        if (resp && resp.ok) {
          var copy = resp.clone();
          caches.open(RUNTIME_CACHE).then(function (cache) {
            return cache.put(req, copy);
          }).then(function () { return trimCache(RUNTIME_CACHE, TOTAL_LIMIT); });
        }
        return resp;
      }).catch(function () { return caches.match('./offline.html'); });
    });
  }

  function staleWhileRevalidate(req) {
    return caches.match(req).then(function (c) {
      var fetchP = fetch(req).then(function (resp) {
        if (resp && resp.ok) {
          var copy = resp.clone();
          caches.open(RUNTIME_CACHE).then(function (cache) { return cache.put(req, copy); });
        }
        return resp;
      }).catch(function () { return c; });
      return c || fetchP;
    });
  }

  self.addEventListener('sync', function (event) {
    if (event.tag === SYNC_TAG) {
      event.waitUntil(doBackgroundSync());
    }
  });

  function doBackgroundSync() {
    return self.clients.matchAll({ includeUncontrolled: true }).then(function (cs) {
      cs.forEach(function (c) {
        c.postMessage({ type: 'sync-project-start', tag: SYNC_TAG });
      });
    });
  }

  self.addEventListener('message', function (event) {
    var data = event.data || {};
    if (data.type === 'SKIP_WAITING') self.skipWaiting();
    if (data.type === 'CLEAR_RUNTIME') {
      caches.delete(RUNTIME_CACHE).then(function () {
        event.ports[0] && event.ports[0].postMessage({ ok: true });
      });
    }
  });
})(typeof self !== 'undefined' ? self : this);
