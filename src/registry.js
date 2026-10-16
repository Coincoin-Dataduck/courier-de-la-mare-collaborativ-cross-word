// Liste des grilles (un seul Durable Object nommé "registry")
// g:<id> = la fiche de la grille, k:<id> = son résumé pour le kiosque (tenu à jour par la grille)
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8' } })

const DSC = { on: false, webhook: '', heure: 8, site: '', types: { neuves: true, terminees: true, corrigees: true, enCours: true, presque: true } }

export class Registry {
  constructor(ctx, env) { this.ctx = ctx; this.env = env }
  async fetch(req) {
    const st = this.ctx.storage, path = new URL(req.url).pathname
    if (path === '/list') {
      const m = await st.list({ prefix: 'g:' })
      return json([...m.values()].sort((a, b) => (b.numero || 0) - (a.numero || 0)))
    }
    if (path === '/kiosque') {
      const gs = [...(await st.list({ prefix: 'g:' })).values()]
      const ks = await st.list({ prefix: 'k:' })
      const out = await Promise.all(gs.map(async g => {
        let k = ks.get('k:' + g.id)
        if (!k) {
          // grille d'avant le kiosque : on lui demande son résumé une fois
          try {
            const r = await this.env.GRID.get(this.env.GRID.idFromName(g.id)).fetch('https://do/summary')
            if (r.ok) { k = await r.json(); await st.put('k:' + g.id, k) }
          } catch {}
        }
        return k ? { ...k, numero: g.numero, source: g.source, date: g.date, created: g.created } : null
      }))
      return json(out.filter(Boolean).sort((a, b) => (b.numero || 0) - (a.numero || 0)))
    }
    if (path === '/sum') {
      const k = await req.json()
      if (k && k.id && (await st.get('g:' + k.id))) await st.put('k:' + k.id, k)
      return json({ ok: true })
    }
    if (path === '/next') {
      const n = ((await st.get('n')) || 0) + 1
      await st.put('n', n)
      return json({ numero: n })
    }
    if (path === '/discord' && req.method === 'GET') return json({ ...DSC, ...((await st.get('discord')) || {}), journal: (await st.get('dlog')) || [] })
    if (path === '/discord' && req.method === 'PUT') { const d = await req.json(); await st.put('discord', { ...((await st.get('discord')) || {}), ...d }); return json({ ok: true }) }
    if (path === '/dlog' && req.method === 'POST') { const e = await req.json(); await st.put('dlog', [e, ...((await st.get('dlog')) || [])].slice(0, 7)); return json({ ok: true }) }
    if (path === '/put') { const g = await req.json(); await st.put('g:' + g.id, g); return json({ ok: true }) }
    if (path === '/del') { const { id } = await req.json(); await st.delete(['g:' + id, 'k:' + id]); return json({ ok: true }) }
    return json({ error: 'introuvable' }, 404)
  }
}
