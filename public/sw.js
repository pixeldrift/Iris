// Minimal offline shell: network-first for pages, cache-first for hashed assets.
const CACHE = 'lilac-v3'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return
  if (new URL(req.url).pathname === '/version.json') return // always network
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')))
    return
  }
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        }),
    ),
  )
})

// Tapping a reminder notification brings Lilac forward and opens that task.
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const id = e.notification.data && e.notification.data.id
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const win = list[0]
      if (win) {
        win.postMessage({ type: 'open-task', id })
        return win.focus()
      }
      return self.clients.openWindow('/')
    }),
  )
})
