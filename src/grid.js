// Une grille = un Durable Object. WebSockets en mode hibernation.
// Le crayon de bois n'existe que dans le navigateur de chacun : le serveur ne voit que la machine à écrire.
import { words, isBlack, cleanMeta, INKS } from '../public/js/shared.js'

const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
const LETTER = /^[A-Z]$/

export class Grid {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env
    this.ready = ctx.blockConcurrencyWhile(() => this.load())
  }

  async load() {
    const st = this.ctx.storage
    this.meta = (await st.get('meta')) || null
    this.cells = Object.fromEntries([...(await st.list({ prefix: 'c:' }))].map(([k, v]) => [k.slice(2), v]))
    this.players = Object.fromEntries([...(await st.list({ prefix: 'p:' }))].map(([k, v]) => [k.slice(2), v]))
    this.found = Object.fromEntries([...(await st.list({ prefix: 'f:' }))].map(([k, v]) => [k.slice(2), v]))
    this.index()
  }

  index() {
    this.byCell = {}
    if (!this.meta) return
    const w = words(this.meta)
    this.words = [...w.h, ...w.v]
    for (const x of this.words) for (const [r, c] of x.cells) (this.byCell[r + ',' + c] ||= []).push(x)
  }

  scores() {
    const s = {}
    for (const f of Object.values(this.found)) s[f.pid] = (s[f.pid] || 0) + 1
    return s
  }

  state() {
    const feed = Object.entries(this.found).map(([id, f]) => ({ id, ...f })).sort((a, b) => b.ts - a.ts).slice(0, 5)
    return { meta: this.meta, cells: this.cells, players: this.players, scores: this.scores(), feed, foundIds: Object.keys(this.found) }
  }

  async fetch(req) {
    await this.ready
    const url = new URL(req.url), st = this.ctx.storage

    if (url.pathname === '/meta' && req.method === 'PUT') {
      const prev = this.meta
      const m = cleanMeta({ ...(prev || {}), ...(await req.json()) })
      if (prev) { m.id = prev.id; m.numero = prev.numero; m.created = prev.created }
      if (!m.id) return json({ error: 'id manquant' }, 400)
      this.meta = m
      await st.put('meta', m)
      // Si les cases noires ont changé : on retire les lettres devenues impossibles et les mots qui n'existent plus
      if (prev && (prev.blacks !== m.blacks || prev.rows !== m.rows || prev.cols !== m.cols)) {
        const del = []
        for (const k of Object.keys(this.cells)) {
          const [r, c] = k.split(',').map(Number)
          if (r >= m.rows || c >= m.cols || isBlack(m, r, c)) { delete this.cells[k]; del.push('c:' + k) }
        }
        this.index()
        const ok = new Set(this.words.map(w => w.id + ':' + w.cells.map(x => x.join(',')).join('|')))
        for (const [id, f] of Object.entries(this.found)) if (!ok.has(id + ':' + f.sig)) { delete this.found[id]; del.push('f:' + id) }
        if (del.length) await st.delete(del)
      } else this.index()
      this.broadcast({ t: 'reload' })
      return json(m)
    }

    if (!this.meta) return json({ error: 'introuvable' }, 404)

    if (url.pathname === '/state') return json(this.state())
    if (url.pathname === '/admin') {
      const total = this.meta.blacks.split('').filter(x => x === '0').length
      return json({ meta: this.meta, filled: Object.keys(this.cells).length, total, players: Object.keys(this.players).length })
    }

    if (url.pathname === '/' && req.method === 'DELETE') {
      this.broadcast({ t: 'deleted' })
      for (const ws of this.ctx.getWebSockets()) try { ws.close(4004, 'grille supprimée') } catch {}
      await st.deleteAll()
      this.meta = null; this.cells = {}; this.players = {}; this.found = {}; this.index()
      return json({ ok: true })
    }

    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'websocket attendu' }, 426)
      if (this.ctx.getWebSockets().length >= 40) return json({ error: 'complet' }, 429)
      const pair = new WebSocketPair()
      this.ctx.acceptWebSocket(pair[1])
      pair[1].serializeAttachment({ pid: null })
      return new Response(null, { status: 101, webSocket: pair[0] })
    }
    return json({ error: 'introuvable' }, 404)
  }

  broadcast(msg, except) {
    const s = JSON.stringify(msg)
    for (const ws of this.ctx.getWebSockets()) if (ws !== except) try { ws.send(s) } catch {}
  }

  async webSocketMessage(ws, raw) {
    await this.ready
    if (!this.meta) return
    let m; try { m = JSON.parse(raw) } catch { return }
    const att = ws.deserializeAttachment() || {}
    const st = this.ctx.storage

    if (m.t === 'hello') {
      const pid = String(m.pid || '').replace(/[^a-z0-9]/gi, '').slice(0, 24)
      const name = String(m.name || '').replace(/\s+/g, ' ').trim().slice(0, 24)
      if (!pid || !name) return
      const color = INKS.includes(m.color) ? m.color : INKS[0]
      ws.serializeAttachment({ pid })
      const p = this.players[pid]
      if (!p || p.name !== name || p.color !== color) {
        this.players[pid] = { name, color }
        await st.put('p:' + pid, this.players[pid])
        this.broadcast({ t: 'player', pid, name, color })
      }
      ws.send(JSON.stringify({ t: 'online', pids: this.online() }))
      this.broadcast({ t: 'online', pids: this.online() }, ws)
      return
    }

    const pid = att.pid
    if (!pid || !this.players[pid]) return
    const r = m.r | 0, c = m.c | 0
    const inside = r >= 0 && c >= 0 && r < this.meta.rows && c < this.meta.cols && !isBlack(this.meta, r, c)

    if (m.t === 'cur') {
      if (!inside) return
      ws.serializeAttachment({ pid, r, c })
      this.broadcast({ t: 'cur', pid, r, c }, ws)
      return
    }

    if (m.t === 'put') {
      const ch = String(m.ch || '').toUpperCase()
      if (!inside || !LETTER.test(ch)) return
      const k = r + ',' + c, old = this.cells[k]
      if (old && old.ch === ch) return
      this.cells[k] = { ch, pid }
      await st.put('c:' + k, this.cells[k])
      this.broadcast({ t: 'put', r, c, ch, pid })
      // Une lettre corrigée : les mots qui passaient par là ne sont plus acquis
      if (old) await this.revoke(k)
      // Le mot revient à celui ou celle qui pose la dernière lettre
      for (const w of this.byCell[k] || []) {
        if (this.found[w.id]) continue
        if (!w.cells.every(([a, b]) => this.cells[a + ',' + b])) continue
        const word = w.cells.map(([a, b]) => this.cells[a + ',' + b].ch).join('')
        const f = { pid, word, ts: Date.now(), sig: w.cells.map(x => x.join(',')).join('|') }
        this.found[w.id] = f
        await st.put('f:' + w.id, f)
        this.broadcast({ t: 'found', id: w.id, pid, word, ts: f.ts })
      }
      return
    }

    if (m.t === 'del') {
      if (!inside) return
      const k = r + ',' + c
      if (!this.cells[k]) return
      delete this.cells[k]
      await st.delete('c:' + k)
      this.broadcast({ t: 'del', r, c, pid })
      await this.revoke(k)
      return
    }
  }

  // On s'est trompé : le mot n'est plus trouvé, le point est retiré
  async revoke(k) {
    for (const w of this.byCell[k] || []) {
      const f = this.found[w.id]
      if (!f) continue
      delete this.found[w.id]
      await this.ctx.storage.delete('f:' + w.id)
      this.broadcast({ t: 'unfound', id: w.id, pid: f.pid })
    }
  }

  online() {
    const s = new Set()
    for (const ws of this.ctx.getWebSockets()) { const a = ws.deserializeAttachment(); if (a && a.pid) s.add(a.pid) }
    return [...s]
  }

  async webSocketClose(ws) {
    const a = ws.deserializeAttachment() || {}
    try { ws.close() } catch {}
    if (!a.pid) return
    const still = this.ctx.getWebSockets().filter(w => w !== ws)
    const pids = [...new Set(still.map(w => (w.deserializeAttachment() || {}).pid).filter(Boolean))]
    if (!pids.includes(a.pid)) this.broadcast({ t: 'leave', pid: a.pid }, ws)
    this.broadcast({ t: 'online', pids }, ws)
  }
  async webSocketError(ws) { return this.webSocketClose(ws) }
}
