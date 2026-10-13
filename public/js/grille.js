// Le Courrier de la Mare — la grille côté joueur
import { words, isBlack, INKS } from './shared.js'

const $ = id => document.getElementById(id)
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const gid = location.pathname.split('/').filter(Boolean)[1] || ''
const MOBILE = matchMedia('(max-width:760px)').matches

let meta, W, byCell = {}
let cells = {}, players = {}, scores = {}, feed = [], online = new Set(), others = {}
let PC = load('cdlm:pc:' + gid) || {}          // crayon de bois : uniquement dans ce navigateur
let me = load('cdlm:me')
let abandon = null, foundSet = new Set()
let sel = null, mode = 'ink', ws = null, wsTry = 0, cs = 18, el = [], done = false

function load(k) { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }
const key = (r, c) => r + ',' + c

// ---------- démarrage ----------
async function start() {
  verso()
  let st
  try {
    const r = await fetch('/api/g/' + gid + '/state')
    if (r.status === 404) return perdu()
    st = await r.json()
  } catch { $('etat').textContent = 'Pas de réseau…'; setTimeout(start, 3000); return }
  apply(st)
  build()
  if (!me || !me.pid || !me.name) accueil(); else connect()
}
function perdu() { $('journal').classList.add('hide'); $('accueil').classList.add('hide'); $('perdu').classList.remove('hide'); document.title = 'Grille introuvable — Le Courrier de la Mare' }

function apply(st) {
  meta = st.meta; abandon = st.abandon || null; foundSet = new Set(st.foundIds || []); cells = st.cells || {}; players = st.players || {}; scores = st.scores || {}; feed = st.feed || []
  W = words(meta); byCell = {}
  for (const w of [...W.h, ...W.v]) for (const [r, c] of w.cells) (byCell[key(r, c)] ||= {})[w.d] = w
  meta.clues = meta.clues || {}
  for (const k of Object.keys(PC)) { const [r, c] = k.split(',').map(Number); if (r >= meta.rows || c >= meta.cols || isBlack(meta, r, c) || cells[k]) delete PC[k] }
}

// ---------- la une ----------
function masthead() {
  const d = meta.date ? new Date(meta.date + 'T12:00:00') : new Date(meta.created || Date.now())
  let ds = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  $('m-date').textContent = ds.charAt(0).toUpperCase() + ds.slice(1)
  $('m-num').textContent = 'N° ' + meta.numero
  $('m-sam').textContent = meta.meteoSam || '—'; $('m-dim').textContent = meta.meteoDim || '—'
  $('m-saint').textContent = meta.saint || ''; $('m-saint-r').classList.toggle('hide', !meta.saint)
  $('m-lune').textContent = meta.lune || lune(d)
  $('m-soleil').textContent = meta.soleil || ''; $('m-soleil-r').classList.toggle('hide', !meta.soleil)
  $('m-band').textContent = 'Grille n° ' + meta.numero + ' · ' + meta.rows + ' × ' + meta.cols
  const pa = meta.annonces || []
  $('pa').classList.toggle('hide', !pa.length)
  $('pa-cols').innerHTML = pa.map(a => { const m = a.match(/^(.*?[.!?…])(\s+.*)?$/); return m ? '<p><b>' + esc(m[1]) + '</b>' + esc(m[2] || '') + '</p>' : '<p><b>' + esc(a) + '</b></p>' }).join('')
  chapeau()
}
function chapeau() {
  const n = Object.keys(players).length
  $('chap').innerHTML = 'Grille de ' + meta.rows + ' × ' + meta.cols + (meta.source ? ' · Journal d’origine : ' + esc(meta.source) : '') + ' · ' + n + ' joueur' + (n > 1 ? 's' : '')
}
function lune(d) {
  const age = (((d - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % 29.530588853 + 29.530588853) % 29.530588853
  return age < 1.85 ? 'nouvelle' : age < 6.5 ? 'croissante' : age < 8.3 ? 'premier quartier' : age < 13.9 ? 'gibbeuse' : age < 15.7 ? 'pleine' : age < 21.2 ? 'gibbeuse' : age < 23 ? 'dernier quartier' : age < 27.7 ? 'décroissante' : 'nouvelle'
}
function verso() {
  const t = "Le conseil municipal s'est réuni jeudi soir à la salle des fêtes pour examiner le budget de l'année prochaine. Les travaux de voirie de la route départementale seront achevés avant l'hiver, a précisé le maire. Le marché du samedi matin accueillera de nouveaux exposants dès le mois prochain. "
  document.querySelectorAll('[data-verso]').forEach(v => { let h = ''; for (let i = 0; i < 14; i++) h += '<p>' + t.repeat(3) + '</p>'; v.innerHTML = h })
}

// ---------- la grille ----------
function build() {
  masthead()
  const g = $('g'), R = meta.rows, C = meta.cols
  g.style.gridTemplateColumns = 'repeat(' + C + ',var(--cs))'
  let h = ''
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const cl = ['c']; if (isBlack(meta, r, c)) cl.push('n')
      if (r === 0) cl.push('top'); if (c === 0) cl.push('left'); if (c === C - 1) cl.push('right'); if (r === R - 1) cl.push('bot')
      h += '<div class="' + cl.join(' ') + '" data-r="' + r + '" data-c="' + c + '"></div>'
    }
  }
  g.innerHTML = h
  el = []; g.querySelectorAll('.c').forEach(e => { const r = +e.dataset.r, c = +e.dataset.c; (el[r] ||= [])[c] = e })
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) draw(r, c)
  list('h', $('lh')); list('v', $('lv'))
  fit()
  const first = W.h[0] || W.v[0]
  if (first) { sel = { r: first.cells[0][0], c: first.cells[0][1], d: first.d }; refresh(false) }
  ranking(); fil(); progress(false)
}
function fit() {
  const vp = $('vp')
  if (MOBILE) { if (enJeu) { fitJeu(); cs = fitCs } else { vp.classList.add('apercu'); cs = Math.max(6, Math.floor((vp.clientWidth - 4) / (meta.cols + 1.2))) } }
  else cs = Math.max(14, Math.min(34, Math.floor((vp.clientWidth - 30) / meta.cols)))
  setCs()
}
function setCs() { const g = $('g'); g.style.setProperty('--cs', cs + 'px'); g.style.setProperty('--lab', Math.max(18, Math.round(cs * 1.1)) + 'px') }

function draw(r, c, anim) {
  const e = el[r][c], k = key(r, c), v = cells[k], p = PC[k]
  if (isBlack(meta, r, c)) return
  const nb = W.nums[k] ? '<b class="num">' + W.nums[k] + '</b>' : ''
  if (v) {
    const pl = players[v.pid] || { name: '?', color: '#24211d' }
    e.innerHTML = nb + '<i' + (anim ? ' class="st"' : '') + ' title="' + esc(pl.name) + '" style="color:' + pl.color + '">' + v.ch + '</i>'
  } else if (p) e.innerHTML = nb + '<i class="pc' + (anim ? ' dr' : '') + '" title="Au crayon (toi seul·e le vois)">' + p + '</i>'
  else e.innerHTML = nb
  const o = others[k]
  if (o) { e.classList.add('o'); e.style.setProperty('--oc', o.color); e.insertAdjacentHTML('beforeend', '<span class="tag">' + esc(o.name) + '</span>') }
  else { e.classList.remove('o') }
}

const wordAt = (r, c, d) => (byCell[key(r, c)] || {})[d]
const cellsOf = w => w ? w.cells : []
const defOf = w => meta.clues[w.id] || '—'
const sensTxt = w => w.n + (w.d === 'h' ? ' horizontal' : ' vertical')

function refresh(scroll = true) {
  document.querySelectorAll('.c.w,.c.s').forEach(e => e.classList.remove('w', 's'))
  document.querySelectorAll('.lab.on').forEach(e => e.classList.remove('on'))
  document.querySelectorAll('.defs li.act').forEach(e => e.classList.remove('act'))
  document.querySelectorAll('.defs span.on').forEach(e => e.classList.remove('on'))
  if (!sel) return
  let w = wordAt(sel.r, sel.c, sel.d)
  if (!w) { const o = sel.d === 'h' ? 'v' : 'h'; if (wordAt(sel.r, sel.c, o)) { sel.d = o; w = wordAt(sel.r, sel.c, o) } }
  for (const [r, c] of cellsOf(w)) el[r][c].classList.add('w')
  el[sel.r][sel.c].classList.add('s')
  document.querySelector('[data-lr="' + sel.r + '"]')?.classList.add('on')
  document.querySelector('[data-lc="' + sel.c + '"]')?.classList.add('on')
  if (w) {
    $('dlabel').textContent = sensTxt(w)
    $('dtext').innerHTML = esc(defOf(w)) + ' <span style="color:#8a8273">(' + w.cells.length + ')</span>'
    $('pat').innerHTML = w.cells.map(([r, c]) => { const k = key(r, c), v = cells[k], p = PC[k]; return v ? '<span>' + v.ch + '</span>' : p ? '<span class="pc">' + p + '</span>' : '<span></span>' }).join('')
    const li = (w.d === 'h' ? $('lh') : $('lv')).querySelector('li[data-id="' + w.id + '"]')
    if (li) { li.classList.add('act'); if (scroll) { const ol = li.parentElement; const t = li.offsetTop - ol.offsetTop; if (t < ol.scrollTop || t > ol.scrollTop + ol.clientHeight - 40) ol.scrollTop = t - 40 } }
  } else { $('dlabel').textContent = ''; $('dtext').textContent = 'Case seule'; $('pat').innerHTML = '' }
  if (scroll) focusSel()
  sendCur()
}
function focusSel() {
  const vp = $('vp'), e = el[sel.r][sel.c]
  const x = e.offsetLeft, y = e.offsetTop
  if (x < vp.scrollLeft + 10 || x > vp.scrollLeft + vp.clientWidth - cs - 10) vp.scrollLeft = x - vp.clientWidth / 2
  if (y < vp.scrollTop + 10 || y > vp.scrollTop + vp.clientHeight - cs - 10) vp.scrollTop = y - vp.clientHeight / 2
}

// ---------- listes de définitions ----------
function patTxt(w) {
  const f = w.cells.filter(([r, c]) => cells[key(r, c)] || PC[key(r, c)]).length
  if (!f) return ''
  return ' <em class="pt">' + w.cells.map(([r, c]) => { const k = key(r, c); return cells[k] ? '<i>' + cells[k].ch + '</i>' : PC[k] ? '<u>' + PC[k] + '</u>' : '_' }).join('') + '</em>'
}
const complet = w => w.cells.every(([r, c]) => cells[key(r, c)])
function liHTML(w) {
  return '<b>' + w.n + '.</b> <span>' + esc(defOf(w)) + '</span> <em class="ln">(' + w.cells.length + ')</em>' + patTxt(w)
}
function list(d, ol) {
  ol.innerHTML = W[d].map(w => '<li data-id="' + w.id + '"' + (complet(w) ? ' class="ok"' : '') + '>' + liHTML(w) + '</li>').join('')
  ol.onclick = e => {
    const li = e.target.closest('li'); if (!li) return
    const w = W.byId[li.dataset.id]; if (!w) return
    const empty = w.cells.find(([r, c]) => !cells[key(r, c)]) || w.cells[0]
    sel = { r: empty[0], c: empty[1], d }
    refresh(); kbFocus()
    if (enJeu) { $('side').classList.remove('ouvert'); if (cs < 24) zoom(30); else centrer() } else if (MOBILE) ouvrirJeu(null)
  }
}
function updLines(r, c) {
  for (const w of Object.values(byCell[key(r, c)] || {})) { const li = document.querySelector('li[data-id="' + w.id + '"]'); if (li) { li.innerHTML = liHTML(w); li.classList.toggle('ok', complet(w)) } }
}

// ---------- saisie ----------
const kb = $('kb')
function kbFocus() { try { kb.focus({ preventScroll: true }) } catch {} }
let lastTap = 0
$('g').addEventListener('click', e => {
  const c = e.target.closest('.c'); if (!c || c.classList.contains('n')) return
  const r = +c.dataset.r, cc = +c.dataset.c
  if (sel && sel.r === r && sel.c === cc) sel.d = sel.d === 'h' ? 'v' : 'h'
  else sel = { r, c: cc, d: sel ? sel.d : 'h' }
  refresh(false); kbFocus()
  if (enJeu && cs < 24) zoom(30)
})
function step(dir) {
  const w = wordAt(sel.r, sel.c, sel.d); if (!w) return
  const i = w.cells.findIndex(([r, c]) => r === sel.r && c === sel.c), n = w.cells[i + dir]
  if (n) { sel.r = n[0]; sel.c = n[1] }
}
function nextWord(dir) {
  const all = [...W.h, ...W.v], w = wordAt(sel.r, sel.c, sel.d)
  let i = all.indexOf(w) + dir; if (i < 0) i = all.length - 1; if (i >= all.length) i = 0
  const x = all[i]; sel = { r: x.cells[0][0], c: x.cells[0][1], d: x.d }; refresh()
}
function type(ch) {
  if (!sel || !me || abandon) return
  const k = key(sel.r, sel.c)
  if (mode === 'pc') {
    if (cells[k]) { step(1); refresh(); return } // on n'écrit pas au crayon par-dessus la machine
    PC[k] = ch; save('cdlm:pc:' + gid, PC); draw(sel.r, sel.c, true); updLines(sel.r, sel.c)
  } else {
    if (!cells[k] || cells[k].ch !== ch) {
      cells[k] = { ch, pid: me.pid }; delete PC[k]; save('cdlm:pc:' + gid, PC)
      draw(sel.r, sel.c, true); updLines(sel.r, sel.c); progress(true)
      send({ t: 'put', r: sel.r, c: sel.c, ch })
    }
  }
  step(1); refresh()
}
function erase(back) {
  if (!sel || abandon) return
  let k = key(sel.r, sel.c)
  if (back && !cells[k] && !PC[k]) { step(-1); k = key(sel.r, sel.c) }
  if (PC[k] && (mode === 'pc' || !cells[k])) { delete PC[k]; save('cdlm:pc:' + gid, PC) }
  else if (cells[k]) { delete cells[k]; send({ t: 'del', r: sel.r, c: sel.c }); progress(false) }
  draw(sel.r, sel.c); updLines(sel.r, sel.c); refresh()
}
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/gi, 'OE').replace(/æ/gi, 'AE').toUpperCase().replace(/[^A-Z]/g, '')
function onKey(e) {
  if (!sel || $('accueil').classList.contains('hide') === false) return
  if (e.target !== kb && e.target !== document.body) return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const k = e.key
  if (k.length === 1 && norm(k)) { e.preventDefault(); for (const ch of norm(k)) type(ch); return }
  if (k === 'Backspace') { e.preventDefault(); erase(true) }
  else if (k === 'Delete') { e.preventDefault(); erase(false) }
  else if (k === ' ') { e.preventDefault(); sel.d = sel.d === 'h' ? 'v' : 'h'; refresh() }
  else if (k === 'Tab') { e.preventDefault(); nextWord(e.shiftKey ? -1 : 1) }
  else if (k === 'Enter') { e.preventDefault(); nextWord(1) }
  else if (k.startsWith('Arrow')) {
    e.preventDefault()
    const [dr, dc] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k]
    const d = dr ? 'v' : 'h'
    if (sel.d !== d && wordAt(sel.r, sel.c, d)) { sel.d = d; refresh(); return }
    let r = sel.r + dr, c = sel.c + dc
    while (r >= 0 && c >= 0 && r < meta.rows && c < meta.cols && isBlack(meta, r, c)) { r += dr; c += dc }
    if (r >= 0 && c >= 0 && r < meta.rows && c < meta.cols) { sel.r = r; sel.c = c; sel.d = d; refresh() }
  }
}
document.addEventListener('keydown', onKey)
// claviers de téléphone (keydown « Unidentified ») : on lit ce qui arrive dans le champ caché
kb.addEventListener('input', () => { const v = norm(kb.value); kb.value = ''; for (const ch of v) type(ch) })
kb.addEventListener('beforeinput', e => { if (e.inputType === 'deleteContentBackward') { e.preventDefault(); erase(true) } })

// outil
function setMode(m) { mode = m; $('m-ink').classList.toggle('on', m === 'ink'); $('m-pc').classList.toggle('on', m === 'pc'); kbFocus() }
$('m-ink').onclick = () => setMode('ink'); $('m-pc').onclick = () => setMode('pc')

// zoom au doigt (téléphone uniquement)
{
  const vp = $('vp'); let pin = null
  const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
  vp.addEventListener('touchstart', e => {
    if (e.touches.length !== 2 || (MOBILE && !enJeu)) return
    const b = vp.getBoundingClientRect(), mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - b.left, my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - b.top
    pin = { d: dist(e.touches), cs0: cs, k: 1, mx, my, px: vp.scrollLeft + mx, py: vp.scrollTop + my }
    const g = $('g'); g.classList.add('geste'); g.style.transformOrigin = pin.px + 'px ' + pin.py + 'px'
  }, { passive: true })
  vp.addEventListener('touchmove', e => {
    if (!pin || e.touches.length !== 2) return
    e.preventDefault()
    pin.k = Math.min(52 / pin.cs0, Math.max(6 / pin.cs0, dist(e.touches) / pin.d))
    $('g').style.transform = 'scale(' + pin.k + ')'
  }, { passive: false })
  const fin = e => {
    if (!pin || e.touches.length >= 2) return
    const g = $('g'), n = Math.round(pin.cs0 * pin.k)
    g.style.transform = ''; g.classList.remove('geste')
    if (n !== cs) { cs = n; setCs(); vp.scrollLeft = pin.px / pin.cs0 * cs - pin.mx; vp.scrollTop = pin.py / pin.cs0 * cs - pin.my }
    pin = null; majTout()
  }
  vp.addEventListener('touchend', fin); vp.addEventListener('touchcancel', fin)
  document.addEventListener('gesturestart', e => { if (vp.contains(e.target)) e.preventDefault() })
  addEventListener('resize', () => { if (meta && !matchMedia('(max-width:760px)').matches) fit() })
}

// ---------- classement, fil, avancement ----------
function ranking() {
  const ids = Object.keys(players).filter(p => (scores[p] || 0) > 0 || online.has(p) || (me && p === me.pid))
  ids.sort((a, b) => (scores[b] || 0) - (scores[a] || 0) || players[a].name.localeCompare(players[b].name))
  const top = ids.slice(0, 10)
  $('cl').innerHTML = top.map(p => '<li class="' + (me && p === me.pid ? 'moi' : '') + (online.has(p) ? '' : ' off') + '"><i style="background:' + players[p].color + '"></i>' + esc(players[p].name) + '<b>' + (scores[p] || 0) + ' mot' + ((scores[p] || 0) > 1 ? 's' : '') + '</b></li>').join('') +
    (ids.length > 10 ? '<li class="plus">et ' + (ids.length - 10) + ' autres</li>' : '')
  if (!top.length) $('cl').innerHTML = '<li class="plus">Personne n’a encore trouvé de mot.</li>'
  chapeau()
  $('moiici').innerHTML = me ? 'Tu écris en <b style="color:' + me.color + '">' + esc(me.name) + '</b>. <button id="renom">Changer</button>' : ''
  const b = $('renom'); if (b) b.onclick = accueil
}
const sens = id => W.byId[id] ? sensTxt(W.byId[id]) : (id[0] === 'h' ? 'horizontal' : 'vertical')
function fil(newest) {
  $('fil').innerHTML = feed.slice(0, 3).map((f, i) => { const p = players[f.pid] || { name: '?', color: '#24211d' }; return '<p' + (i === 0 && newest ? ' class="new"' : '') + '><b style="color:' + p.color + '">' + esc(p.name) + '</b> a trouvé ' + esc(f.word) + ' en ' + sens(f.id) + '.</p>' }).join('')
}
function progress(anim) {
  let tot = 0, ink = 0
  for (let r = 0; r < meta.rows; r++) for (let c = 0; c < meta.cols; c++) if (!isBlack(meta, r, c)) { tot++; if (cells[key(r, c)]) ink++ }
  const pct = tot ? Math.floor(ink * 100 / tot) : 0
  $('j-info').textContent = 'N° ' + meta.numero + ' · ' + pct + ' %'
  $('avance').textContent = pct + ' % de la grille est rempli.'
  // Tous les mots trouvés : double tamponné. Abandonnée par l'admin : tamponné seulement.
  const nW = W.h.length + W.v.length, dbl = nW > 0 && foundSet.size >= nW, fin = dbl || !!abandon
  const t = $('tampons'); t.classList.toggle('simple', !dbl)
  if (fin && !done) { if (!anim) t.style.setProperty('--x', 0); t.classList.add('on') }
  if (!fin) t.classList.remove('on')
  done = fin
}

// ---------- premier passage ----------
function accueil() {
  const v = $('accueil'), nom = $('nom'), go = $('go')
  let color = (me && me.color) || INKS.find(c => !Object.values(players).some(p => p.color === c)) || INKS[0]
  nom.value = (me && me.name) || ''
  const draw_ = () => { $('encres').innerHTML = INKS.map(c => '<button type="button" aria-label="Encre" class="' + (c === color ? 'on' : '') + '" style="background:' + c + '" data-c="' + c + '"></button>').join(''); nom.style.color = color }
  draw_()
  $('encres').onclick = e => { const b = e.target.closest('button'); if (b) { color = b.dataset.c; draw_() } }
  const dbl = $('doublon')
  const ok = () => { go.disabled = !nom.value.trim(); dbl.classList.add('hide') }
  nom.oninput = ok; ok()
  nom.onkeydown = e => { if (e.key === 'Enter' && !go.disabled) go.click() }
  go.onclick = () => {
    const name = nom.value.replace(/\s+/g, ' ').trim().slice(0, 24); if (!name) return
    // même pseudo déjà sur cette grille (autre appareil ?) : on demande avant de créer un 2e joueur
    const same = Object.entries(players).find(([p, x]) => p !== (me && me.pid) && simp(x.name) === simp(name))
    if (same) {
      const [pid, x] = same
      $('doublon-q').innerHTML = 'Il y a déjà un·e <b style="color:' + x.color + '">' + esc(x.name) + '</b> sur cette grille. C’est toi ?'
      $('d-btns').classList.remove('hide'); dbl.classList.remove('hide'); go.disabled = true
      $('d-oui').onclick = () => { me = { pid, name: x.name, color: x.color }; save('cdlm:me', me); location.reload() }
      $('d-non').onclick = () => { $('doublon-q').textContent = 'Choisis un autre nom, alors.'; $('d-btns').classList.add('hide'); nom.select(); nom.focus() }
      return
    }
    me = { pid: (me && me.pid) || rid(), name, color }; save('cdlm:me', me)
    v.classList.add('hide')
    if (ws && ws.readyState === 1) send({ t: 'hello', ...me }); else connect()
    ranking(); kbFocus()
  }
  v.classList.remove('hide'); setTimeout(() => nom.focus(), 50)
}
const simp = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
function rid() { const a = new Uint8Array(12); crypto.getRandomValues(a); return [...a].map(x => (x % 36).toString(36)).join('') }

// ---------- temps réel ----------
function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)) }
let curT = 0
function sendCur() { clearTimeout(curT); curT = setTimeout(() => sel && send({ t: 'cur', r: sel.r, c: sel.c }), 120) }
function etat(t, ko) { const e = $('etat'); e.textContent = t; e.classList.toggle('ko', !!ko) }

function connect() {
  const u = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/g/' + gid + '/ws'
  ws = new WebSocket(u)
  ws.onopen = async () => {
    etat('')
    if (wsTry > 0) { // on se resynchronise après une coupure
      try { const r = await fetch('/api/g/' + gid + '/state'); if (r.status === 404) return perdu(); apply(await r.json()); for (let r_ = 0; r_ < meta.rows; r_++) for (let c = 0; c < meta.cols; c++) draw(r_, c); list('h', $('lh')); list('v', $('lv')); refresh(false); progress(false) } catch {}
    }
    wsTry = 0
    send({ t: 'hello', ...me }); sendCur(); ranking()
  }
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data) } catch { return } on(m) }
  ws.onclose = ev => {
    if (ev.code === 4004) return perdu()
    etat('Connexion perdue, on rappelle…', true)
    others = {}; online = new Set()
    setTimeout(connect, Math.min(15000, 800 * 2 ** wsTry++))
  }
}

function moveOther(pid, r, c) {
  for (const [k, o] of Object.entries(others)) if (o.pid === pid) { delete others[k]; const [a, b] = k.split(',').map(Number); draw(a, b) }
  if (r == null || !players[pid]) return
  others[key(r, c)] = { pid, name: players[pid].name, color: players[pid].color }
  draw(r, c)
}
function on(m) {
  switch (m.t) {
    case 'put': {
      const k = key(m.r, m.c), mine = me && m.pid === me.pid && cells[k] && cells[k].ch === m.ch
      cells[k] = { ch: m.ch, pid: m.pid }
      if (PC[k]) { delete PC[k]; save('cdlm:pc:' + gid, PC) }
      if (!mine) { draw(m.r, m.c, true); updLines(m.r, m.c); progress(true); if (sel) refresh(false) }
      break
    }
    case 'del': { delete cells[key(m.r, m.c)]; draw(m.r, m.c); updLines(m.r, m.c); progress(false); if (sel) refresh(false); break }
    case 'found': { foundSet.add(m.id); progress(true); scores[m.pid] = (scores[m.pid] || 0) + 1; feed.unshift({ id: m.id, pid: m.pid, word: m.word, ts: m.ts }); feed = feed.slice(0, 5); ranking(); fil(true); break }
    case 'unfound': { foundSet.delete(m.id); progress(false); if (scores[m.pid]) scores[m.pid]--; feed = feed.filter(f => f.id !== m.id); ranking(); fil(false); break }
    case 'player': { players[m.pid] = { name: m.name, color: m.color }; ranking(); for (const [k, o] of Object.entries(others)) if (o.pid === m.pid) { const [a, b] = k.split(',').map(Number); moveOther(m.pid, a, b) } break }
    case 'online': { online = new Set(m.pids); ranking(); break }
    case 'leave': { online.delete(m.pid); moveOther(m.pid, null); ranking(); break }
    case 'cur': { if (!me || m.pid !== me.pid) moveOther(m.pid, m.r, m.c); break }
    case 'reload': { location.reload(); break }
    case 'deleted': { perdu(); break }
  }
}

start()

// ---------- vue de jeu (téléphone) ----------
// Dans le journal, la grille n'est qu'une image : la page défile normalement.
// En jeu, la grille prend tout l'écran, rien d'autre ne défile.
var enJeu = false, fitCs = 18, savedY = 0
const side = $('side'), colG = document.querySelector('.col-grille')
function vvSync() {
  const v = window.visualViewport, st = document.documentElement.style
  st.setProperty('--vh', (v ? v.height : innerHeight) + 'px'); st.setProperty('--vt', (v ? v.offsetTop : 0) + 'px')
}
if (window.visualViewport) { visualViewport.addEventListener('resize', vvSync); visualViewport.addEventListener('scroll', vvSync) }
function fitJeu() {
  const vp = $('vp')
  fitCs = Math.max(6, Math.floor(Math.min((vp.clientWidth - 8) / (meta.cols + 1.2), (vp.clientHeight - 8) / (meta.rows + 1.2))))
}
function centrer() {
  if (!sel) return
  const vp = $('vp'), w = wordAt(sel.r, sel.c, sel.d), cl = w ? w.cells : [[sel.r, sel.c]]
  const a = el[cl[0][0]][cl[0][1]], z = el[cl[cl.length - 1][0]][cl[cl.length - 1][1]]
  const wide = z.offsetLeft + cs - a.offsetLeft <= vp.clientWidth && z.offsetTop + cs - a.offsetTop <= vp.clientHeight
  const e = wide ? null : el[sel.r][sel.c]
  const x = e ? e.offsetLeft + cs / 2 : (a.offsetLeft + z.offsetLeft + cs) / 2, y = e ? e.offsetTop + cs / 2 : (a.offsetTop + z.offsetTop + cs) / 2
  vp.scrollTo({ left: x - vp.clientWidth / 2, top: y - vp.clientHeight / 2, behavior: 'smooth' })
}
function zoom(n) { cs = n; setCs(); centrer(); majTout() }
function majTout() { $('j-tout').textContent = cs > fitCs ? 'Toute la grille' : 'Zoomer' }
function ouvrirJeu(at) {
  if (enJeu) return
  enJeu = true; savedY = scrollY; vvSync()
  document.body.style.top = -savedY + 'px'; document.body.classList.add('enjeu')
  $('vp').classList.remove('apercu')
  if (location.hash !== '#jeu') history.pushState({ jeu: 1 }, '', '#jeu')
  if (at) { const [r, c] = at; sel = { r, c, d: sel ? sel.d : 'h' } }
  kbFocus()   // tout de suite : le téléphone n'ouvre le clavier que pendant le geste
  requestAnimationFrame(() => {
    fitJeu(); cs = fitCs; setCs(); refresh(false)
    if (at && cs < 24) zoom(30); else majTout()
  })
}
function fermerJeu(pop) {
  if (!enJeu) return
  enJeu = false; kb.blur(); side.classList.remove('ouvert')
  document.body.classList.remove('enjeu'); document.body.style.top = ''
  scrollTo(0, savedY)
  fit(); refresh(false)
  if (!pop && location.hash === '#jeu') history.back()
}
if (location.hash === '#jeu') history.replaceState(null, '', location.pathname)
addEventListener('popstate', () => { if (enJeu) fermerJeu(true) })
// dans le journal, toucher la grille ouvre le jeu
$('vp').addEventListener('click', e => {
  if (!MOBILE || enJeu) return
  e.stopPropagation()
  const c = e.target.closest('.c')
  ouvrirJeu(c && !c.classList.contains('n') && c.dataset.r != null ? [+c.dataset.r, +c.dataset.c] : null)
}, true)
$('jouer').onclick = () => ouvrirJeu(null)
$('j-close').onclick = () => fermerJeu(false)
$('j-tout').onclick = () => { if (cs > fitCs) { cs = fitCs; setCs(); majTout() } else zoom(30); kbFocus() }
$('j-defs').onclick = () => { kb.blur(); side.classList.add('ouvert'); side.scrollTop = 0; const a = side.querySelector('li.act'); if (a) a.scrollIntoView({ block: 'center' }) }
$('j-sidex').onclick = () => { side.classList.remove('ouvert'); kbFocus() }
// en jeu, toucher la grille ou le bandeau ne doit pas fermer le clavier
colG.addEventListener('mousedown', e => { if (enJeu && !e.target.closest('input')) e.preventDefault() })
// bandeau : toucher = changer de sens, glisser = mot suivant / précédent
{
  const d = $('defbar'); let t0 = null
  d.addEventListener('touchstart', e => { if (!enJeu || e.target.closest('.mode')) { t0 = null; return } const t = e.touches[0]; t0 = { x: t.clientX, y: t.clientY } }, { passive: true })
  d.addEventListener('touchend', e => {
    if (!t0) return
    const t = e.changedTouches[0], dx = t.clientX - t0.x, dy = t.clientY - t0.y; t0 = null
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { e.preventDefault(); nextWord(dx < 0 ? 1 : -1); if (cs < 24) zoom(30); kbFocus() }
    else if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && sel) {
      e.preventDefault()
      const o = sel.d === 'h' ? 'v' : 'h'
      if (wordAt(sel.r, sel.c, o)) { sel.d = o; refresh(false); centrer() }
      kbFocus()
    }
  })
}
