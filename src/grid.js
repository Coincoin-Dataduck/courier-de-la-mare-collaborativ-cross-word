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
    this.abandon = (await st.get('abandon')) || null   // date d'abandon (admin) : grille tamponnée, plus d'écriture
    this.last = (await st.get('last')) || null         // date de la dernière lettre
    // Mots cassés : x:<mot> = le mot trouvé mis « à revoir » ; r:<mot>|<case> = la lettre barrée
    this.revoir = Object.fromEntries([...(await st.list({ prefix: 'x:' }))].map(([k, v]) => [k.slice(2), v]))
    this.ratures = Object.fromEntries([...(await st.list({ prefix: 'r:' }))].map(([k, v]) => [k.slice(2), v]))
    // h:<mot> = { ORTHOGRAPHE: pid } : qui a trouvé chaque version du mot en premier
    this.hist = Object.fromEntries([...(await st.list({ prefix: 'h:' }))].map(([k, v]) => [k.slice(2), v]))
    for (const [id, f] of Object.entries(this.found)) if (!this.hist[id]) this.hist[id] = { [f.word]: f.pid }
    // Mots corrigés dans leur sens : y:<mot> = la version d'avant ; q:<mot>|<case> = ses lettres barrées
    this.corriges = Object.fromEntries([...(await st.list({ prefix: 'y:' }))].map(([k, v]) => [k.slice(2), v]))
    this.qratures = Object.fromEntries([...(await st.list({ prefix: 'q:' }))].map(([k, v]) => [k.slice(2), v]))
    // Crayon partagé : l:<case> = { ch, pid } ; ne compte pas, ne casse rien
    this.pencils = Object.fromEntries([...(await st.list({ prefix: 'l:' }))].map(([k, v]) => [k.slice(2), v]))
    this.casses = (await st.get('casses')) || []       // les dernières cassures, pour le fil
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
    const feed = [...Object.entries(this.found).map(([id, f]) => ({ id, ...f })), ...this.casses].sort((a, b) => b.ts - a.ts).slice(0, 30)
    return { meta: this.meta, cells: this.cells, players: this.players, scores: this.scores(), feed, foundIds: Object.keys(this.found), abandon: this.abandon, pencils: this.pencils, revoir: this.revoir, ratures: this.ratures, corriges: this.corriges, qratures: this.qratures, owners: Object.fromEntries(Object.entries(this.found).map(([id, f]) => [id, f.pid])) }
  }

  // Résumé pour le kiosque
  summary() {
    const m = this.meta, sc = this.scores()
    let best = null
    for (const [pid, n] of Object.entries(sc)) if (!best || n > best.n) { const p = this.players[pid] || {}; best = { name: p.name || '?', color: p.color || '#24211d', n } }
    let filled = '', tot = 0, ink = 0
    for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
      const k = r + ',' + c, f = this.cells[k] ? '1' : '0'
      filled += f
      if (!isBlack(m, r, c)) { tot++; if (f === '1') ink++ }
    }
    const who = new Set([...Object.values(this.cells).map(x => x.pid), ...Object.values(this.found).map(x => x.pid)])
    const nw = (this.words || []).length, nf = Object.keys(this.found).length
    const last = this.last || Math.max(0, ...Object.values(this.found).map(f => f.ts || 0)) || null
    const fin = nw > 0 && nf >= nw ? 'double' : this.abandon ? 'simple' : null
    return { id: m.id, numero: m.numero, rows: m.rows, cols: m.cols, blacks: m.blacks, filled, pct: tot ? Math.floor(ink * 100 / tot) : 0, players: who.size, best, last, fin, abandon: this.abandon }
  }
  registry() { return this.env.REGISTRY.get(this.env.REGISTRY.idFromName('registry')) }
  async push() { try { await this.registry().fetch('https://do/sum', { method: 'POST', body: JSON.stringify(this.summary()) }) } catch {} }
  // On prévient le kiosque quelques secondes après une modification (pas à chaque lettre)
  async touch() {
    const st = this.ctx.storage
    if (typeof st.setAlarm !== 'function') return this.push()
    if (!(await st.getAlarm())) await st.setAlarm(Date.now() + 4000)
  }
  async alarm() { await this.ready; if (this.meta) await this.push() }

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
        for (const k of Object.keys(this.pencils)) {
          const [r, c] = k.split(',').map(Number)
          if (r >= m.rows || c >= m.cols || isBlack(m, r, c)) { delete this.pencils[k]; del.push('l:' + k) }
        }
        this.index()
        const ok = new Set(this.words.map(w => w.id + ':' + w.cells.map(x => x.join(',')).join('|')))
        for (const [id, f] of Object.entries(this.found)) if (!ok.has(id + ':' + f.sig)) { delete this.found[id]; del.push('f:' + id) }
        for (const id of Object.keys(this.revoir)) del.push('x:' + id)
        for (const id of Object.keys(this.ratures)) del.push('r:' + id)
        for (const id of Object.keys(this.corriges)) del.push('y:' + id)
        for (const id of Object.keys(this.qratures)) del.push('q:' + id)
        this.revoir = {}; this.ratures = {}; this.corriges = {}; this.qratures = {}
        if (del.length) await st.delete(del)
      } else this.index()
      this.broadcast({ t: 'reload' })
      await this.push()
      return json(m)
    }

    if (!this.meta) return json({ error: 'introuvable' }, 404)

    if (url.pathname === '/state') return json(this.state())
    if (url.pathname === '/summary') return json(this.summary())
    if (url.pathname === '/abandon' && req.method === 'POST') {
      const { on } = await req.json().catch(() => ({}))
      if (on) { this.abandon = Date.now(); await st.put('abandon', this.abandon) } else { this.abandon = null; await st.delete('abandon') }
      this.broadcast({ t: 'reload' })
      await this.push()
      return json(this.summary())
    }
    if (url.pathname === '/admin') {
      const total = this.meta.blacks.split('').filter(x => x === '0').length
      return json({ meta: this.meta, filled: Object.keys(this.cells).length, total, players: Object.keys(this.players).length })
    }

    if (url.pathname === '/' && req.method === 'DELETE') {
      this.broadcast({ t: 'deleted' })
      for (const ws of this.ctx.getWebSockets()) try { ws.close(4004, 'grille supprimée') } catch {}
      if (typeof st.deleteAlarm === 'function') await st.deleteAlarm()
      await st.deleteAll()
      this.meta = null; this.cells = {}; this.players = {}; this.found = {}; this.abandon = null; this.last = null; this.revoir = {}; this.ratures = {}; this.corriges = {}; this.qratures = {}; this.hist = {}; this.casses = []; this.index()
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
        await this.touch()
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

    if (this.abandon && (m.t === 'put' || m.t === 'del' || m.t === 'doute' || m.t === 'pc')) return

    const d = m.d === 'v' ? 'v' : 'h'   // le sens dans lequel le joueur écrit

    if (m.t === 'put') {
      const ch = String(m.ch || '').toUpperCase()
      if (!inside || !LETTER.test(ch)) return
      await this.onEdit(r + ',' + c, ch, pid, pid, d, false, !!m.dq)
      return
    }

    // Crayon : tout le monde le voit, on écrit et on efface librement (jamais par-dessus l'encre)
    if (m.t === 'pc') {
      const k = r + ',' + c, ch = m.ch ? String(m.ch).toUpperCase() : null
      if (!inside || this.cells[k] || (ch && !LETTER.test(ch))) return
      if (ch) { this.pencils[k] = { ch, pid }; await st.put('l:' + k, this.pencils[k]) }
      else { if (!this.pencils[k]) return; delete this.pencils[k]; await st.delete('l:' + k) }
      this.broadcast({ t: 'pc', r, c, ch, pid }, ws)
      return
    }

    // « Pas sûr » : on marque ou on démarque une lettre déjà posée (tout le monde peut)
    if (m.t === 'doute') {
      const k = r + ',' + c, v = this.cells[k]
      if (!inside || !v || !!v.dq === !!m.on) return
      if (m.on) v.dq = 1; else delete v.dq
      await this.ctx.storage.put('c:' + k, v)
      this.broadcast({ t: 'doute', r, c, on: !!m.on, pid })
      return
    }

    if (m.t === 'del') {
      if (!inside) return
      await this.onEdit(r + ',' + c, null, pid, pid, d)
      return
    }

    // « Remettre » : les lettres barrées reviennent, avec leur auteur d'origine
    if (m.t === 'remettre') {
      const id = String(m.id || ''), w = this.wordById(id)
      if (!w) return
      if (this.revoir[id]) {
        const list = Object.entries(this.ratures).filter(([rk]) => rk.startsWith(id + '|'))
        for (const [rk, ra] of list) await this.onEdit(rk.slice(id.length + 1), ra.ch, ra.pid, pid, w.d, true)
        if (this.revoir[id]) await this.resolve(id)
      } else if (this.corriges[id]) {
        const list = Object.entries(this.qratures).filter(([rk]) => rk.startsWith(id + '|'))
        for (const [rk, ra] of list) await this.onEdit(rk.slice(id.length + 1), ra.ch, ra.pid, pid, w.d, true)
        if (this.corriges[id]) await this.resolveCorr(id)
      } else return
      this.sendConf()
      return
    }

    // « Effacer le reste » : on enlève les lettres du mot que plus rien ne tient
    if (m.t === 'nettoyer') {
      const id = String(m.id || ''), w = this.wordById(id)
      if (!w || !this.revoir[id]) return
      await this.resolve(id)
      for (const [a2, b2] of w.cells) {
        const k = a2 + ',' + b2
        if (!this.cells[k]) continue
        const tenue = (this.byCell[k] || []).some(x => x.id !== id && (this.found[x.id] || this.revoir[x.id]))
        if (!tenue) await this.onEdit(k, null, pid, pid, w.d, true)
      }
      this.sendConf()
      return
    }

    // « C'est bon » : un autre joueur valide la correction
    if (m.t === 'cestbon') {
      const id = String(m.id || ''), y = this.corriges[id]
      if (!y) return
      await this.resolveCorr(id)
      this.sendConf()
      return
    }
  }

  wordById(id) { return (this.words || []).find(w => w.id === id) }

  // Toute modification d'une case passe par ici.
  // ch = null pour effacer. author = à qui appartient la lettre, actor = qui agit, d = sens d'écriture.
  async onEdit(k, ch, author, actor, d, sys = false, dq = false) {
    const st = this.ctx.storage, old = this.cells[k], now = Date.now()
    if (ch ? old && old.ch === ch : !old) return
    const ws = this.byCell[k] || [], casse = []
    // On passe à la machine la même lettre que le crayon de quelqu'un : elle reste à lui (et le mot aussi s'il se termine là)
    const pen = this.pencils[k]
    let pcBy = null
    if (ch && pen && !old && !sys && author === actor && pen.ch === ch) author = pcBy = pen.pid

    // 0. Les mots corrigés : remettre une lettre barrée la rend à son auteur
    for (const w of ws) {
      if (!this.corriges[w.id]) continue
      const rk = w.id + '|' + k, ra = this.qratures[rk]
      if (ra && ch === ra.ch) {
        author = ra.pid
        delete this.qratures[rk]; await st.delete('q:' + rk)
        if (!Object.keys(this.qratures).some(x => x.startsWith(w.id + '|'))) await this.resolveCorr(w.id)
      }
    }

    // 1. Les mots « à revoir » qu'on règle
    for (const w of ws) {
      if (!this.revoir[w.id]) continue
      if (w.d === d) { await this.resolve(w.id); continue }         // on le corrige dans son sens : c'est le joueur qui tranche
      const rk = w.id + '|' + k, ra = this.ratures[rk]
      if (ra && ch === ra.ch) {                                       // on a remis la lettre barrée
        author = ra.pid
        delete this.ratures[rk]; await st.delete('r:' + rk)
        if (!Object.keys(this.ratures).some(x => x.startsWith(w.id + '|'))) await this.resolve(w.id)
      }
    }

    // 2. Les mots trouvés qui passaient par là : cassés (autre sens) ou simplement plus complets / corrigés (même sens)
    for (const w of ws) {
      const f = this.found[w.id]
      // Correction dans le sens du mot (ou mot déjà en correction) : il reste jouable, mais marqué « corrigé »
      if (w.d === d && old && !sys && (this.corriges[w.id] || (f && f.pid !== actor))) {
        if (!this.corriges[w.id]) {
          this.corriges[w.id] = { pid: f.pid, word: f.word, by: actor, ts: now }
          casse.push({ t: 'corr', id: w.id, by: actor, from: f.word, ts: now })
        } else this.corriges[w.id].by = actor
        await st.put('y:' + w.id, this.corriges[w.id])
        const rk = w.id + '|' + k
        if (!this.qratures[rk] && !(ch && this.corriges[w.id] && false)) { this.qratures[rk] = { ch: old.ch, pid: old.pid, by: actor, ts: now }; await st.put('q:' + rk, this.qratures[rk]) }
      }
      if (!f) continue
      delete this.found[w.id]; await st.delete('f:' + w.id)
      this.broadcast({ t: 'unfound', id: w.id, pid: f.pid })
      if (w.d !== d && old) {
        if (this.corriges[w.id]) await this.resolveCorr(w.id)
        this.revoir[w.id] = { pid: f.pid, word: f.word, by: actor, ts: now }
        await st.put('x:' + w.id, this.revoir[w.id])
        const rk = w.id + '|' + k
        this.ratures[rk] = { ch: old.ch, pid: old.pid, by: actor, ts: now }
        await st.put('r:' + rk, this.ratures[rk])
        const src = ws.find(x => x.d === d)
        casse.push({ t: 'casse', id: w.id, by: actor, src: src ? src.id : null, ts: now })
      }
    }

    // 3. La case elle-même
    if (ch) {
      this.cells[k] = dq ? { ch, pid: author, dq: 1 } : { ch, pid: author }
      if (pen) { delete this.pencils[k]; await st.delete('l:' + k) }
      await st.put('c:' + k, this.cells[k])
      const [r, c] = k.split(',').map(Number)
      this.broadcast({ t: 'put', r, c, ch, pid: author, dq: dq ? 1 : 0 })
    } else {
      delete this.cells[k]
      await st.delete('c:' + k)
      const [r, c] = k.split(',').map(Number)
      this.broadcast({ t: 'del', r, c, pid: actor })
    }
    this.last = now; await st.put('last', this.last)

    // 4. Les mots qui deviennent complets
    if (ch) for (const w of ws) {
      if (this.found[w.id] || this.revoir[w.id]) continue
      if (!w.cells.every(([a, b]) => this.cells[a + ',' + b])) continue
      await this.complete(w, pcBy || actor)
      const y = this.corriges[w.id]
      if (y && this.found[w.id].word === y.word) await this.resolveCorr(w.id)
    }

    if (casse.length) {
      this.casses = [...casse, ...this.casses].slice(0, 30)
      await st.put('casses', this.casses)
    }
    this.sendConf(casse)
    await this.touch()
  }

  // Un mot complet : s'il a exactement une orthographe déjà trouvée, il revient à celui ou celle qui l'avait trouvée.
  // Sinon il va à qui pose la dernière lettre.
  async complete(w, placer) {
    const st = this.ctx.storage
    const word = w.cells.map(([a, b]) => this.cells[a + ',' + b].ch).join('')
    const h = this.hist[w.id] || {}
    const pid = h[word] && this.players[h[word]] ? h[word] : placer
    if (!h[word]) {
      h[word] = pid
      const ks = Object.keys(h); if (ks.length > 8) delete h[ks[0]]
      this.hist[w.id] = h; await st.put('h:' + w.id, h)
    }
    const f = { pid, word, ts: Date.now(), sig: w.cells.map(x => x.join(',')).join('|') }
    this.found[w.id] = f
    await st.put('f:' + w.id, f)
    this.broadcast({ t: 'found', id: w.id, pid, word, ts: f.ts })
  }

  // Le mot n'est plus « à revoir » : on retire ses ratures
  async resolve(id) {
    const st = this.ctx.storage, del = ['x:' + id]
    delete this.revoir[id]
    for (const rk of Object.keys(this.ratures)) if (rk.startsWith(id + '|')) { delete this.ratures[rk]; del.push('r:' + rk) }
    await st.delete(del)
  }

  async resolveCorr(id) {
    const st = this.ctx.storage, del = ['y:' + id]
    delete this.corriges[id]
    for (const rk of Object.keys(this.qratures)) if (rk.startsWith(id + '|')) { delete this.qratures[rk]; del.push('q:' + rk) }
    await st.delete(del)
  }

  sendConf(casse = []) { this.broadcast({ t: 'conf', revoir: this.revoir, ratures: this.ratures, corriges: this.corriges, qratures: this.qratures, casse }) }

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
