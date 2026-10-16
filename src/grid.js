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
    // Correction : sol = la solution (cases noires = '#'), corr = { ts, justes: { mot: pid|null }, total, fautes }
    this.sol = (await st.get('sol')) || null
    this.corr = (await st.get('corr')) || null
    // Mots contestés : x:<mot> = { pid, word, by, ts, tenu } (la version d'avant et à qui elle était)
    // r:<mot>|<case> = { ch, pid } : la lettre d'avant, raturée
    this.contestes = Object.fromEntries([...(await st.list({ prefix: 'x:' }))].map(([k, v]) => [k.slice(2), v]))
    this.ratures = Object.fromEntries([...(await st.list({ prefix: 'r:' }))].map(([k, v]) => [k.slice(2), v]))
    await this.migrer()
    // h:<mot> = { ORTHOGRAPHE: pid } : qui a trouvé chaque version du mot en premier
    this.hist = Object.fromEntries([...(await st.list({ prefix: 'h:' }))].map(([k, v]) => [k.slice(2), v]))
    for (const [id, f] of Object.entries(this.found)) if (!this.hist[id]) this.hist[id] = { [f.word]: f.pid }
    // Crayon partagé : l:<case> = { ch, pid } ; ne compte pas, ne casse rien
    this.pencils = Object.fromEntries([...(await st.list({ prefix: 'l:' }))].map(([k, v]) => [k.slice(2), v]))
    this.casses = ((await st.get('casses')) || []).filter(e => e.t === 'conteste')   // les dernières contestations, pour le fil
    this.index()
  }

  // Ancien format : « à revoir » (x:/r:) et « corrigé » (y:/q:) deviennent un seul état « contesté »
  async migrer() {
    const st = this.ctx.storage, put = {}, del = []
    for (const [id, x] of Object.entries(this.contestes)) if (x.tenu === undefined) { x.tenu = true; put['x:' + id] = x }
    for (const [k, v] of await st.list({ prefix: 'y:' })) {
      const id = k.slice(2)
      if (!this.contestes[id]) { this.contestes[id] = { ...v, tenu: false }; put['x:' + id] = this.contestes[id] }
      del.push(k)
    }
    for (const [k, v] of await st.list({ prefix: 'q:' })) {
      const rk = k.slice(2)
      if (!this.ratures[rk]) { this.ratures[rk] = { ch: v.ch, pid: v.pid }; put['r:' + rk] = this.ratures[rk] }
      del.push(k)
    }
    const ks = Object.keys(put)
    for (let i = 0; i < ks.length; i += 100) await st.put(Object.fromEntries(ks.slice(i, i + 100).map(k => [k, put[k]])))
    for (let i = 0; i < del.length; i += 100) await st.delete(del.slice(i, i + 100))
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
    if (this.corr) { for (const p of Object.values(this.corr.justes)) if (p) s[p] = (s[p] || 0) + 1; return s }
    for (const f of Object.values(this.found)) s[f.pid] = (s[f.pid] || 0) + 1
    return s
  }

  state() {
    const ev = this.corr ? [{ t: 'correcteur', ts: this.corr.ts, fautes: this.corr.fautes }] : []
    const feed = [...Object.entries(this.found).map(([id, f]) => ({ id, ...f })), ...this.casses, ...ev].sort((a, b) => b.ts - a.ts).slice(0, 30)
    return { corr: this.corr, sol: this.corr ? this.sol : null, meta: this.meta, cells: this.cells, players: this.players, scores: this.scores(), feed, foundIds: Object.keys(this.found), abandon: this.abandon, pencils: this.pencils, contestes: this.contestes, ratures: this.ratures, owners: Object.fromEntries(Object.entries(this.found).map(([id, f]) => [id, f.pid])) }
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
    const tout = nw > 0 && nf >= nw && !Object.keys(this.contestes).length
    const fin = this.corr ? (this.corr.fautes ? 'simple' : 'double') : this.abandon || tout ? 'simple' : null
    const corr = this.corr ? { total: this.corr.total, fautes: this.corr.fautes, ts: this.corr.ts } : null
    return { corr, id: m.id, numero: m.numero, rows: m.rows, cols: m.cols, blacks: m.blacks, filled, pct: tot ? Math.floor(ink * 100 / tot) : 0, players: who.size, best, last, fin, abandon: this.abandon }
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
        for (const id of Object.keys(this.contestes)) del.push('x:' + id)
        for (const id of Object.keys(this.ratures)) del.push('r:' + id)
        this.contestes = {}; this.ratures = {}
        if (this.sol) { this.sol = null; this.corr = null; del.push('sol', 'corr') }
        for (let i = 0; i < del.length; i += 100) await st.delete(del.slice(i, i + 100))
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
      const lettres = Object.fromEntries(Object.entries(this.cells).map(([k, v]) => [k, v.ch]))
      return json({ meta: this.meta, filled: Object.keys(this.cells).length, total, players: Object.keys(this.players).length, lettres, sol: this.sol, corr: this.corr })
    }
    if (url.pathname === '/solution' && req.method === 'DELETE') {
      this.corr = null; this.sol = null
      await st.delete(['corr', 'sol'])
      this.broadcast({ t: 'reload' }); await this.push()
      return json(this.summary())
    }
    if (url.pathname === '/solution' && req.method === 'POST') {
      const { sol } = await req.json().catch(() => ({}))
      const m = this.meta, N = m.rows * m.cols
      if (typeof sol !== 'string' || sol.length !== N) return json({ error: 'solution incomplète' }, 400)
      for (let i = 0; i < N; i++) {
        const noir = m.blacks[i] === '1'
        if (noir ? sol[i] !== '#' : !LETTER.test(sol[i])) return json({ error: noir ? 'case noire différente' : 'il manque des lettres' }, 400)
      }
      // La solution tranche : le point va à qui possède la version juste (l'ancienne d'un mot contesté, ou l'actuelle), sinon à personne
      const justes = {}
      for (const w of this.words) {
        const sw = w.cells.map(([a, b]) => sol[a * m.cols + b]).join(''), x = this.contestes[w.id], f = this.found[w.id]
        justes[w.id] = x && x.word === sw ? x.pid : f && f.word === sw ? f.pid : null
      }
      const total = this.words.length, fautes = Object.values(justes).filter(p => !p).length
      this.sol = sol; this.corr = { ts: Date.now(), justes, total, fautes }
      // les doutes et les contestations n'ont plus lieu d'être
      const put = { sol, corr: this.corr }, del = []
      for (const [k, v] of Object.entries(this.cells)) if (v.dq) { delete v.dq; put['c:' + k] = v }
      for (const id of Object.keys(this.contestes)) del.push('x:' + id)
      for (const rk of Object.keys(this.ratures)) del.push('r:' + rk)
      this.contestes = {}; this.ratures = {}
      const ks = Object.keys(put)
      for (let i = 0; i < ks.length; i += 100) await st.put(Object.fromEntries(ks.slice(i, i + 100).map(k => [k, put[k]])))
      for (let i = 0; i < del.length; i += 100) await st.delete(del.slice(i, i + 100))
      this.broadcast({ t: 'reload' }); await this.push()
      return json(this.summary())
    }

    if (url.pathname === '/' && req.method === 'DELETE') {
      this.broadcast({ t: 'deleted' })
      for (const ws of this.ctx.getWebSockets()) try { ws.close(4004, 'grille supprimée') } catch {}
      if (typeof st.deleteAlarm === 'function') await st.deleteAlarm()
      await st.deleteAll()
      this.meta = null; this.cells = {}; this.players = {}; this.found = {}; this.abandon = null; this.last = null; this.contestes = {}; this.ratures = {}; this.pencils = {}; this.hist = {}; this.casses = []; this.sol = null; this.corr = null; this.index()
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

    if (this.abandon || this.corr) return   // grille abandonnée ou corrigée : plus rien ne s'écrit

    if (m.t === 'put') {
      const ch = String(m.ch || '').toUpperCase()
      if (!inside || !LETTER.test(ch)) return
      await this.onEdit(r + ',' + c, ch, pid, pid)
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
      await this.onEdit(r + ',' + c, null, pid, pid)
      return
    }

    // « Annuler » : les lettres d'avant reviennent, avec leur auteur ; le mot revient à son ancien propriétaire
    if (m.t === 'remettre') {
      const id = String(m.id || '')
      if (!this.contestes[id]) return
      for (const [rk, ra] of this.ratesDe(id)) await this.onEdit(rk.slice(id.length + 1), ra.ch, ra.pid, pid)
      if (this.contestes[id]) await this.resolve(id)
      this.sendConf()
      return
    }

    // « Effacer le reste » : seulement si la nouvelle lettre était tenue par un mot complet dans l'autre sens
    if (m.t === 'nettoyer') {
      const id = String(m.id || ''), w = this.wordById(id), x = this.contestes[id]
      if (!w || !x || !x.tenu) return
      await this.resolve(id)
      // on abandonne ce mot : s'il était complet, il ne compte plus (sans nouvelle contestation)
      const f = this.found[id]
      if (f) { delete this.found[id]; await this.ctx.storage.delete('f:' + id); this.broadcast({ t: 'unfound', id, pid: f.pid }) }
      for (const [a2, b2] of w.cells) {
        const k = a2 + ',' + b2
        if (!this.cells[k]) continue
        const tenue = (this.byCell[k] || []).some(o => o.id !== id && (this.found[o.id] || this.contestes[o.id]))
        if (!tenue) await this.onEdit(k, null, pid, pid)
      }
      this.sendConf()
      return
    }

    // « C'est bon » : on garde la nouvelle version, les ratures s'en vont
    if (m.t === 'cestbon') {
      const id = String(m.id || '')
      if (!this.contestes[id]) return
      await this.resolve(id)
      this.sendConf()
      return
    }
  }

  wordById(id) { return (this.words || []).find(w => w.id === id) }

  // Toute modification d'une case passe par ici, quel que soit le sens d'écriture.
  // ch = null pour effacer. author = à qui appartient la lettre, actor = qui agit.
  async onEdit(k, ch, author, actor) {
    const st = this.ctx.storage, old = this.cells[k], now = Date.now()
    if (ch ? old && old.ch === ch : !old) return   // la même lettre : rien ne change
    const ws = this.byCell[k] || [], casse = [], remis = new Set()
    // On passe à la machine la même lettre que le crayon de quelqu'un : elle reste à lui (et le mot aussi s'il se termine là)
    const pen = this.pencils[k]
    let pcBy = null
    if (ch && pen && !old && author === actor && pen.ch === ch) author = pcBy = pen.pid

    // 1. Les mots déjà contestés
    for (const w of ws) {
      const x = this.contestes[w.id]
      if (!x) continue
      const rk = w.id + '|' + k, ra = this.ratures[rk]
      if (ra && ch === ra.ch) {
        // on remet la lettre d'avant : elle revient à son auteur ; tout est remis = fin de la contestation
        author = ra.pid
        delete this.ratures[rk]; await st.delete('r:' + rk); this.confDirty = true
        if (!this.ratesDe(w.id).length) { await this.resolve(w.id); remis.add(w.id) }
        continue
      }
      const i = w.cells.findIndex(([a, b]) => a + ',' + b === k)
      if (!ra && old && old.ch === x.word[i]) { this.ratures[rk] = { ch: old.ch, pid: old.pid }; await st.put('r:' + rk, this.ratures[rk]); this.confDirty = true }
      if (ch && !x.tenu && this.tenu(w, k)) { x.tenu = true; await st.put('x:' + w.id, x); this.confDirty = true }
    }

    // 2. Les mots trouvés qui passaient par là ne comptent plus et deviennent contestés
    for (const w of ws) {
      const f = this.found[w.id]
      if (!f) continue
      delete this.found[w.id]; await st.delete('f:' + w.id)
      this.broadcast({ t: 'unfound', id: w.id, pid: f.pid })
      if (this.contestes[w.id] || remis.has(w.id)) continue
      const x = { pid: f.pid, word: f.word, by: actor, ts: now, tenu: !!ch && this.tenu(w, k) }
      const rk = w.id + '|' + k
      this.contestes[w.id] = x; this.ratures[rk] = { ch: old.ch, pid: old.pid }; this.confDirty = true
      await st.put({ ['x:' + w.id]: x, ['r:' + rk]: this.ratures[rk] })
      casse.push({ t: 'conteste', id: w.id, by: actor, pid: f.pid, word: f.word, ts: now })
    }

    // 3. La case elle-même
    if (ch) {
      this.cells[k] = { ch, pid: author }
      if (pen) { delete this.pencils[k]; await st.delete('l:' + k) }
      await st.put('c:' + k, this.cells[k])
      const [r, c] = k.split(',').map(Number)
      this.broadcast({ t: 'put', r, c, ch, pid: author })
    } else {
      delete this.cells[k]
      await st.delete('c:' + k)
      const [r, c] = k.split(',').map(Number)
      this.broadcast({ t: 'del', r, c, pid: actor })
    }
    this.last = now; await st.put('last', this.last)

    // 4. Les mots qui deviennent complets
    if (ch) for (const w of ws) {
      if (this.found[w.id]) continue
      if (!w.cells.every(([a, b]) => this.cells[a + ',' + b])) continue
      await this.complete(w, pcBy || actor)
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

  // Le mot de l'autre sens, en (k), est-il complet ? (la nouvelle lettre est déjà posée ou en train de l'être)
  tenu(w, k) {
    return (this.byCell[k] || []).some(o => o.id !== w.id && o.cells.every(([a, b]) => a + ',' + b === k || this.cells[a + ',' + b]))
  }

  ratesDe(id) { return Object.entries(this.ratures).filter(([rk]) => rk.startsWith(id + '|')) }

  // Fin de la contestation : on retire le mot contesté et ses ratures
  async resolve(id) {
    const del = ['x:' + id]
    delete this.contestes[id]
    for (const [rk] of this.ratesDe(id)) { delete this.ratures[rk]; del.push('r:' + rk) }
    await this.ctx.storage.delete(del)
    this.confDirty = true
  }

  // On n'envoie les contestations que quand elles ont changé
  sendConf(casse = []) {
    if (!this.confDirty && !casse.length) return
    this.confDirty = false
    this.broadcast({ t: 'conf', contestes: this.contestes, ratures: this.ratures, casse })
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
