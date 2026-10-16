// Le Courrier de la Mare — Worker Cloudflare (assets statiques + Durable Objects)
import { Grid } from './grid.js'
import { Registry } from './registry.js'
export { Grid, Registry }

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
const ID_RE = /^[a-z0-9]{8}$/

function page(env, req, file, status = 200) {
  const u = new URL(req.url); u.pathname = file; u.search = ''
  return env.ASSETS.fetch(new Request(u.toString())).then(r => new Response(r.body, { status: r.ok ? status : r.status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }))
}
const registry = env => env.REGISTRY.get(env.REGISTRY.idFromName('registry'))
const grid = (env, id) => env.GRID.get(env.GRID.idFromName(id))
function isAdmin(env, secret) {
  try { secret = decodeURIComponent(secret || '') } catch { return false }
  const s = (env.ADMIN_SECRET || '').trim()
  if (!s || !secret || secret.length !== s.length) return false
  let d = 0; for (let i = 0; i < s.length; i++) d |= s.charCodeAt(i) ^ secret.charCodeAt(i)
  return d === 0
}
function newId() {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789', b = new Uint8Array(8); crypto.getRandomValues(b)
  return [...b].map(x => a[x % a.length]).join('')
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname.split('/').filter(Boolean)

    // Pages
    if (p[0] === 'g' && p.length === 2) return ID_RE.test(p[1]) ? page(env, req, '/grille.html') : page(env, req, '/introuvable.html', 404)
    if (p[0] === 'admin' && p.length === 2) return isAdmin(env, p[1]) ? page(env, req, '/admin.html') : page(env, req, '/introuvable.html', 404)

    // Le kiosque (public)
    if (url.pathname === '/') return page(env, req, '/kiosque.html')
    if (p[0] === 'api' && p[1] === 'kiosque' && p.length === 2) return registry(env).fetch('https://do/kiosque')

    // API joueurs
    if (p[0] === 'api' && p[1] === 'g' && ID_RE.test(p[2] || '')) {
      const sub = p[3] === 'ws' ? '/ws' : '/state'
      const u = new URL(req.url); u.pathname = sub
      return grid(env, p[2]).fetch(new Request(u.toString(), req))
    }

    // API admin : /api/admin/<secret>/grids[/<id>]
    if (p[0] === 'api' && p[1] === 'admin') {
      if (!isAdmin(env, p[2])) return json({ error: 'introuvable' }, 404)
      if (p[3] !== 'grids') return json({ error: 'introuvable' }, 404)
      const reg = registry(env), id = p[4]
      if (!id) {
        if (req.method === 'GET') return reg.fetch('https://do/list')
        if (req.method === 'POST') {
          const meta = await req.json()
          const gid = newId()
          const num = await (await reg.fetch('https://do/next', { method: 'POST' })).json()
          meta.id = gid; meta.numero = num.numero; meta.created = new Date().toISOString()
          const r = await grid(env, gid).fetch('https://do/meta', { method: 'PUT', body: JSON.stringify(meta) })
          if (!r.ok) return r
          const saved = await r.json()
          await reg.fetch('https://do/put', { method: 'POST', body: JSON.stringify(summary(saved)) })
          return json(saved, 201)
        }
      } else if (ID_RE.test(id)) {
        const g = grid(env, id)
        if (p[5] === 'brouillon' && req.method === 'PUT') return g.fetch('https://do/brouillon', { method: 'PUT', body: await req.text() })
        if (p[5] === 'solution' && (req.method === 'POST' || req.method === 'DELETE')) return g.fetch('https://do/solution', { method: req.method, body: req.method === 'POST' ? await req.text() : undefined })
        if (p[5] === 'abandon' && req.method === 'POST') return g.fetch('https://do/abandon', { method: 'POST', body: await req.text() })
        if (req.method === 'GET') return g.fetch('https://do/admin')
        if (req.method === 'PUT') {
          const meta = await req.json()
          const r = await g.fetch('https://do/meta', { method: 'PUT', body: JSON.stringify(meta) })
          if (!r.ok) return r
          const saved = await r.json()
          await reg.fetch('https://do/put', { method: 'POST', body: JSON.stringify(summary(saved)) })
          return json(saved)
        }
        if (req.method === 'DELETE') {
          await g.fetch('https://do/', { method: 'DELETE' })
          await reg.fetch('https://do/del', { method: 'POST', body: JSON.stringify({ id }) })
          return json({ ok: true })
        }
      }
      return json({ error: 'méthode' }, 405)
    }

    return page(env, req, '/introuvable.html', 404)
  }
}

function summary(m) {
  return { id: m.id, numero: m.numero, rows: m.rows, cols: m.cols, source: m.source || '', date: m.date || '', created: m.created }
}
