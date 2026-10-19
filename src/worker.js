// Le Courrier de la Mare — Worker Cloudflare (assets statiques + Durable Objects)
import { Grid } from './grid.js'
import { Registry } from './registry.js'
import { matin, annonce, poster } from './matin.js'
import { lireDefs, lireSolution } from './lire.js'
export { Grid, Registry }

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
const ID_RE = /^[a-z0-9]{8}$/

function page(env, req, file, status = 200) {
  const u = new URL(req.url); u.pathname = file; u.search = ''
  return env.ASSETS.fetch(new Request(u.toString())).then(r => new Response(r.body, { status: r.ok ? status : r.status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }))
}
const registry = env => env.REGISTRY.get(env.REGISTRY.idFromName('registry'))
const grid = (env, id) => env.GRID.get(env.GRID.idFromName(id))
const sources = env => ({
  liste: async () => (await registry(env).fetch('https://do/list')).json(),
  digest: async id => { const r = await grid(env, id).fetch('https://do/digest'); return r.ok ? r.json() : null },
  reglages: async () => (await registry(env).fetch('https://do/discord')).json(),
  noter: async e => { await registry(env).fetch('https://do/dlog', { method: 'POST', body: JSON.stringify(e) }) },
})
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
  // Réveil toutes les heures : on n'envoie qu'à l'heure choisie dans l'admin (heure de Paris)
  async scheduled(ev, env, ctx) { ctx.waitUntil(matin(env, sources(env), { now: ev.scheduledTime })) },
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname.split('/').filter(Boolean)
    // Lire les définitions d'une capture : POST /api/admin/<secret>/lire { image: data URL }
    if (p[0] === 'api' && p[1] === 'admin' && p[3] === 'lire' && p.length === 4) {
      if (!isAdmin(env, p[2])) return json({ error: 'introuvable' }, 404)
      if (req.method !== 'POST') return json({ error: 'introuvable' }, 404)
      if (!env.AI) return json({ error: 'la lecture n’est pas branchée (bloc [ai] du wrangler.toml)' }, 503)
      const b = await req.json().catch(() => ({}))
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(b.image || '') || b.image.length > 4e6) return json({ error: 'image refusée' }, 400)
      if (b.mode === 'solution') {
        const R = +b.R, C = +b.C
        if (!(R >= 3 && R <= 40 && C >= 3 && C <= 40) || !/^[01]+$/.test(b.B || '') || b.B.length !== R * C) return json({ error: 'grille refusée' }, 400)
        try { return json(await lireSolution(env, b.image, R, C, b.B)) } catch (e) { return json({ error: e.message }, 502) }
      }
      try { return json(await lireDefs(env, b.image)) } catch (e) { return json({ error: e.message }, 502) }
    }
    // Réglages du message du matin : /api/admin/<secret>/discord[/apercu|/envoyer]
    if (p[0] === 'api' && p[1] === 'admin' && p[3] === 'discord') {
      if (!isAdmin(env, p[2])) return json({ error: 'introuvable' }, 404)
      const reg = registry(env)
      if (p.length === 4 && req.method === 'GET') {
        const R = await (await reg.fetch('https://do/discord')).json()
        return json({ ...R, webhook: undefined, aWebhook: !!R.webhook, webhookFin: R.webhook ? R.webhook.slice(-4) : '' })
      }
      if (p.length === 4 && req.method === 'PUT') {
        const b = await req.json().catch(() => ({})), d = { site: url.origin }
        if ('on' in b) d.on = !!b.on
        if ('heure' in b) d.heure = Math.max(0, Math.min(23, b.heure | 0))
        if (b.types && typeof b.types === 'object') d.types = Object.fromEntries(['neuves', 'terminees', 'corrigees', 'enCours', 'presque'].map(k => [k, !!b.types[k]]))
        if (typeof b.webhook === 'string' && b.webhook.trim()) {
          if (!/^https:\/\/(\w+\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(b.webhook.trim())) return json({ error: 'Ce n’est pas une adresse de webhook Discord.' }, 400)
          d.webhook = b.webhook.trim()
        }
        if (b.webhook === null) d.webhook = ''
        await reg.fetch('https://do/discord', { method: 'PUT', body: JSON.stringify(d) })
        return json({ ok: true })
      }
      if (p.length === 5 && p[4] === 'annoncer' && req.method === 'POST') {
        const b = await req.json().catch(() => ({}))
        if (!ID_RE.test(b.id || '')) return json({ error: 'grille introuvable' }, 404)
        const R = await (await reg.fetch('https://do/discord')).json()
        const r = await grid(env, b.id).fetch('https://do/digest')
        if (!r.ok) return json({ error: 'grille introuvable' }, 404)
        const d = await r.json(), now = Date.now()
        const res = await poster(R.webhook, annonce(d, (R.site || url.origin).replace(/\/$/, '')))
        await reg.fetch('https://do/dlog', { method: 'POST', body: JSON.stringify({ ts: now, statut: res.statut, detail: res.detail, quoi: 'Annonce de la grille n° ' + d.numero }) })
        if (res.statut === 'envoye') await reg.fetch('https://do/discord', { method: 'PUT', body: JSON.stringify({ annonces: { ...(R.annonces || {}), [b.id]: now } }) })
        return json(res)
      }
      if (p.length === 5 && (p[4] === 'apercu' || p[4] === 'envoyer') && req.method === 'POST') {
        const b = await req.json().catch(() => ({}))
        return json(await matin(env, sources(env), { force: true, jour: b.jour, envoyer: p[4] === 'envoyer' }))
      }
      return json({ error: 'introuvable' }, 404)
    }

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
