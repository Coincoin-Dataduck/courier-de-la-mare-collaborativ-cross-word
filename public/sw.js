// Le Courrier de la Mare — service worker
// Rôle : rendre l'app installable et la faire démarrer vite.
// Les grilles, les lettres et le temps réel (/api/...) ne passent JAMAIS par le cache :
// tout le monde doit voir la même grille au même moment.
// Changer VERSION à chaque modification de ce fichier pour forcer la mise à jour.
const VERSION = 'cdlm-v1'
const COQUILLE = [
  '/horsligne.html',
  '/journal.css',
  '/js/shared.js', '/js/grille.js', '/js/kiosque.js', '/js/capture.js',
  '/icon-192.png', '/apple-touch-icon.png',
  '/fonts/NimbusMonoPS-Bold.otf'
]

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(COQUILLE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin) return
  // Données, temps réel et rédaction : toujours le réseau, sans cache
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return

  // Pages : le réseau d'abord ; sans réseau, la page « hors ligne »
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/horsligne.html')))
    return
  }

  // Polices : elles ne changent jamais, le cache d'abord
  if (url.pathname.startsWith('/fonts/')) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      if (res.ok) { const copie = res.clone(); caches.open(VERSION).then(c => c.put(req, copie)) }
      return res
    })))
    return
  }

  // CSS, JS, icônes : le réseau d'abord (pour avoir les mises à jour), le cache en secours
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copie = res.clone(); caches.open(VERSION).then(c => c.put(req, copie)) }
    return res
  }).catch(() => caches.match(req)))
})
