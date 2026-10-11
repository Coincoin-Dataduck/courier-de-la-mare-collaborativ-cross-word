// Liste des grilles (un seul Durable Object nommé "registry")
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8' } })

export class Registry {
  constructor(ctx, env) { this.ctx = ctx; this.env = env }
  async fetch(req) {
    const st = this.ctx.storage, path = new URL(req.url).pathname
    if (path === '/list') {
      const m = await st.list({ prefix: 'g:' })
      return json([...m.values()].sort((a, b) => (b.numero || 0) - (a.numero || 0)))
    }
    if (path === '/next') {
      const n = ((await st.get('n')) || 0) + 1
      await st.put('n', n)
      return json({ numero: n })
    }
    if (path === '/put') { const g = await req.json(); await st.put('g:' + g.id, g); return json({ ok: true }) }
    if (path === '/del') { const { id } = await req.json(); await st.delete('g:' + id); return json({ ok: true }) }
    return json({ error: 'introuvable' }, 404)
  }
}
