// Le Courrier de la Mare — la salle de rédaction (admin)
import { words, mirror } from './shared.js'

const $ = id => document.getElementById(id)
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const secret = location.pathname.split('/').filter(Boolean)[1]
const API = '/api/admin/' + encodeURIComponent(decodeURIComponent(secret)) + '/grids'
const ANNONCES = [
  'Vends paille. 25 francs les 12 brins.',
  'Crapaud cherche princesse. S’adresser à la mare.',
  'Canard cherche ses lunettes. Aperçues pour la dernière fois près de la mare. Prévenir la grenouille si vous les avez retrouvées.',
  'Astra la corgi cherche partenaire de jeu. Cardio important exigé.',
  'Rocket le corgi cherche coussin près du feu, confortable et sans enquiquineur.'
]

let cur = null
let R = 15, C = 15, B = ''
let clues = {}
let W = null, el = []
let mode = 'noir', act = null, dirty = false
// La solution : S = une lettre par case ('#' noire, ' ' vide), lettres = celles des joueurs, solCur = la case où l'on tape
let S = '', lettres = {}, solCur = null, corrInfo = null

async function api(path = '', opt = {}) {
  const r = await fetch(API + path, { ...opt, headers: { 'content-type': 'application/json' } })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || ('Erreur ' + r.status))
  return r.json()
}
const lien = id => location.origin + '/g/' + id
// le samedi après aujourd'hui (jamais aujourd'hui)
const samediSuivant = () => { const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); return d.toLocaleDateString('en-CA') }
const fdate = d => d ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
const meta = () => ({ rows: R, cols: C, blacks: B })

// ---------- la liste ----------
async function liste() {
  $('vue-ed').classList.add('hide'); $('vue-liste').classList.remove('hide')
  let gs = []
  try { gs = await api() } catch (e) { $('vide').textContent = 'Impossible de lire la liste : ' + e.message; return }
  const K = {}
  try { for (const k of await (await fetch('/api/kiosque')).json()) K[k.id] = k } catch {}
  const etat = g => { const k = K[g.id] || {}
    if (k.corr) return '<span class="st' + (k.fin === 'double' ? '2' : '1') + '">Corrigée · ' + (k.corr.fautes ? k.corr.fautes + ' faute' + (k.corr.fautes > 1 ? 's' : '') : 'sans faute') + '</span>'
    if (k.abandon) return '<span class="st1">Tamponné</span> <button class="pbtn" data-ab="' + g.id + '" data-on="0">Reprendre</button>'
    return (k.pct || 0) + ' % <button class="pbtn" data-ab="' + g.id + '" data-on="1" data-n="' + g.numero + '">Abandonner</button>' }
  $('cpt').textContent = gs.length + ' grille' + (gs.length > 1 ? 's' : '')
  $('vide').textContent = gs.length ? '' : 'Aucune grille pour l’instant. Le canard attend.'
  $('grilles').innerHTML = gs.map(g => '<tr><td><b>' + g.numero + '</b></td><td>' + fdate(g.date || g.created) + '</td><td class="mob">' + g.rows + ' × ' + g.cols + '</td><td class="mob">' + esc(g.source) + '</td>' +
    '<td><a class="lien" href="/g/' + g.id + '" target="_blank" rel="noopener">' + esc(lien(g.id)) + '</a> <button class="pbtn" data-copy="' + g.id + '">Copier</button></td>' +
    '<td class="mob" style="white-space:nowrap">' + etat(g) + '</td>' +
    '<td style="text-align:right;white-space:nowrap"><button class="pbtn" data-ed="' + g.id + '">Modifier</button> <button class="pbtn rouge" data-del="' + g.id + '" data-n="' + g.numero + '">Supprimer</button></td></tr>').join('')
}
$('grilles').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return
  if (b.dataset.copy) { try { await navigator.clipboard.writeText(lien(b.dataset.copy)); b.textContent = 'Copié' } catch { prompt('Lien à copier', lien(b.dataset.copy)) } setTimeout(() => b.textContent = 'Copier', 1500) }
  if (b.dataset.ed) ouvrir(b.dataset.ed)
  if (b.dataset.ab) {
    const on = b.dataset.on === '1'
    if (on && !confirm('Abandonner la grille n° ' + b.dataset.n + ' ? Elle sera tamponnée (une seule fois) et plus personne ne pourra y écrire. Tu pourras la reprendre.')) return
    try { await api('/' + b.dataset.ab + '/abandon', { method: 'POST', body: JSON.stringify({ on }) }); liste() } catch (err) { alert(err.message) }
  }
  if (b.dataset.del) {
    if (!confirm('Supprimer la grille n° ' + b.dataset.n + ' pour de bon ? Les joueurs perdront tout.')) return
    try { await api('/' + b.dataset.del, { method: 'DELETE' }); liste() } catch (err) { alert(err.message) }
  }
}
$('nouvelle').onclick = () => ouvrir(null)
// Annoncer la grille ouverte sur Discord, tout de suite
const DAPI = API.replace(/\/grids$/, '/discord')
$('ed-annoncer').onclick = async () => {
  if (!cur) return
  if (dirty) { $('ed-etat').textContent = 'Enregistre d’abord la grille.'; return }
  try {
    const R = await (await fetch(DAPI)).json()
    if (!R.aWebhook) { $('ed-etat').textContent = 'Colle d’abord l’adresse du webhook dans le panneau Discord.'; return }
    const deja = R.annonces && R.annonces[cur.id]
    const q = deja ? 'Déjà annoncée le ' + new Date(deja).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) + '. L’annoncer encore ?' : 'Annoncer la grille n° ' + cur.numero + ' sur Discord ?'
    if (!confirm(q)) return
    $('ed-etat').textContent = 'Envoi…'
    const r = await (await fetch(DAPI + '/annoncer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: cur.id }) })).json()
    $('ed-etat').textContent = r.statut === 'envoye' ? 'Annoncée sur Discord.' : 'Échec : ' + (r.detail || r.error || '')
  } catch (e) { $('ed-etat').textContent = e.message }
}
$('retour').onclick = () => { if (dirty && !confirm('Quitter sans enregistrer ?')) return; dirty = false; liste() }
addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = '' } })

// ---------- l'éditeur ----------
async function ouvrir(id) {
  let m = null, info = null
  if (id) { try { info = await api('/' + id); m = info.meta } catch (e) { alert(e.message); return } }
  cur = m
  lettres = (info && info.lettres) || {}; corrInfo = (info && info.corr) || null; S = (info && (info.sol || info.brouillon)) || ''; solCur = null
  $('m-sol').classList.toggle('hide', !m)
  R = m ? m.rows : 15; C = m ? m.cols : 15; B = m ? m.blacks : '0'.repeat(R * C)
  clues = { ...((m && m.clues) || {}) }
  $('ed-titre').textContent = m ? 'Grille n° ' + m.numero : 'Nouvelle grille'
  $('f-rows').value = R; $('f-cols').value = C
  $('f-source').value = m ? m.source : ''
  $('f-date').value = m ? m.date : new Date().toISOString().slice(0, 10)
  $('f-saint').value = m ? m.saint : ''
  $('f-sam').value = m ? m.meteoSam : ''; $('f-dim').value = m ? m.meteoDim : ''
  $('f-lune').value = m ? m.lune : ''; $('f-soleil').value = m ? m.soleil : ''; $('f-prevue').value = m ? (m.prevue || '') : samediSuivant()
  $('f-pa').value = (m ? m.annonces : ANNONCES).join('\n')
  $('ed-voir').classList.toggle('hide', !m); $('ed-annoncer').classList.toggle('hide', !m); if (m) $('ed-voir').href = '/g/' + m.id
  $('ed-etat').textContent = info && info.filled ? 'Attention : ' + info.filled + ' lettres déjà posées par ' + info.players + ' joueur' + (info.players > 1 ? 's' : '') + '. Changer les cases noires efface les lettres concernées.' : ''
  $('vue-liste').classList.add('hide'); $('vue-ed').classList.remove('hide')
  dirty = false; act = null
  setMode(m ? 'def' : 'noir')
  grille(); scrollTo(0, 0)
}
const black = (r, c) => B[r * C + c] === '1'
function setBlack(r, c, v) { const i = r * C + c; B = B.slice(0, i) + (v ? '1' : '0') + B.slice(i + 1) }

function setMode(m) {
  mode = m
  for (const b of $('ed-mode').querySelectorAll('button')) b.classList.toggle('on', b.dataset.m === m)
  $('ed-g').classList.toggle('def', m === 'def'); $('ed-g').classList.toggle('sol', m === 'sol')
  $('ed-corr').classList.toggle('hide', m !== 'sol'); $('ed-decorr').classList.toggle('hide', m !== 'sol' || !corrInfo)
  $('ed-save').classList.toggle('hide', m === 'sol')
  if (m === 'sol') { infoSol(); hl(); return }
  solCur = null
  $('ed-aide').textContent = m === 'noir'
    ? 'Clique ou glisse sur les cases pour les noircir ou les blanchir. Avec la symétrie, la case opposée suit (demi-tour, comme dans les journaux).'
    : 'Clique sur une case pour écrire la définition de son mot (clique encore pour passer d’horizontal à vertical). Entrée passe au mot suivant.'
}
$('ed-mode').onclick = e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.m) }

function grille() {
  W = words(meta())
  S = Array.from({ length: R * C }, (_, i) => B[i] === '1' ? '#' : S.length === R * C && S[i] !== '#' ? S[i] : ' ').join('')
  const g = $('ed-g'), cs = Math.max(16, Math.min(34, Math.floor((g.parentElement.clientWidth - 20) / C)))
  g.style.setProperty('--cs', cs + 'px')
  g.style.gridTemplateColumns = 'repeat(' + C + ',var(--cs))'
  let h = ''
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const cl = ['c']; if (black(r, c)) cl.push('n'); if (r === 0) cl.push('top'); if (c === 0) cl.push('left'); if (c === C - 1) cl.push('right'); if (r === R - 1) cl.push('bot')
    const n = W.nums[r + ',' + c]
    h += '<div class="' + cl.join(' ') + '" data-r="' + r + '" data-c="' + c + '">' + (n ? '<b class="num">' + n + '</b>' : '') + (black(r, c) ? '' : '<i class="sl">' + S[r * C + c].trim() + '</i>') + '</div>'
  }
  g.innerHTML = h
  el = []; g.querySelectorAll('.c').forEach(e => { (el[+e.dataset.r] ||= [])[+e.dataset.c] = e })
  const nb = B.split('').filter(x => x === '1').length
  $('ed-compte').textContent = nb + ' cases noires · ' + (W.h.length + W.v.length) + ' mots'
  defs()
}
function renum() {
  W = words(meta())
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const n = W.nums[r + ',' + c], e = el[r][c]
    const nb = e.querySelector('b.num')
    if (n) { if (!nb) e.insertAdjacentHTML('afterbegin', '<b class="num">' + n + '</b>'); else if (nb.textContent != n) nb.textContent = n }
    else if (nb) nb.remove()
  }
}

// ---------- les définitions ----------
function defs() {
  for (const d of ['h', 'v']) {
    $('d-' + d).innerHTML = W[d].map(w => '<p data-id="' + w.id + '" class="' + (clues[w.id] ? '' : 'vide') + '"><b>' + w.n + '.</b><input data-id="' + w.id + '" value="' + esc(clues[w.id] || '') + '" placeholder="Définition" maxlength="300"><em>' + w.cells.length + ' lettres</em></p>').join('') || '<p class="msg">Pas encore de mot.</p>'
  }
  manque()
  if (act && !W.byId[act]) act = null
  hl()
}
function manque() {
  const all = [...W.h, ...W.v], n = all.filter(w => !clues[w.id]).length
  $('ed-manque').textContent = n ? n + ' sans définition' : all.length ? 'tout est rempli' : ''
  return n
}
function hl(scroll) {
  document.querySelectorAll('#ed-g .c.hl,#ed-g .c.hs').forEach(e => e.classList.remove('hl', 'hs'))
  document.querySelectorAll('.dl p.act').forEach(e => e.classList.remove('act'))
  if (mode === 'sol') {
    if (!solCur) return
    const k = solCur.r + ',' + solCur.c, w = W[solCur.d].find(x => x.cells.some(([a, b]) => a + ',' + b === k))
    if (w) w.cells.forEach(([a, b]) => el[a][b].classList.add('hl'))
    el[solCur.r][solCur.c].classList.add('hs'); return
  }
  const w = act && W.byId[act]; if (!w) return
  w.cells.forEach(([r, c], i) => el[r][c].classList.add(i ? 'hl' : 'hs'))
  const p = document.querySelector('.dl p[data-id="' + w.id + '"]')
  if (p) { p.classList.add('act'); if (scroll) { p.scrollIntoView({ block: 'nearest' }); p.querySelector('input').focus({ preventScroll: true }) } }
}
// Une liste collée se répartit : une ligne par champ, à partir de celui où l'on colle.
// « VERTICALEMENT » / « HORIZONTALEMENT » font passer à l'autre liste ; un numéro en tête (« 12. ») range la ligne dans le mot qui porte ce numéro.
function coller(e, i0) {
  const txt = (e.clipboardData || window.clipboardData)?.getData('text') || ''
  const lignes = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lignes.length < 2) return   // une seule ligne : collage normal
  e.preventDefault()
  const w0 = W.byId[i0.dataset.id]; let d = w0.d, k = W[d].indexOf(w0), n = 0, dernier = null
  for (const l of lignes) {
    const tete = l.replace(/[^A-Za-zÀ-ÿ]/g, '').toUpperCase()
    if (/^HORIZONTALEMENT$/.test(tete)) { d = 'h'; k = 0; continue }
    if (/^VERTICALEMENT$/.test(tete)) { d = 'v'; k = 0; continue }
    const m = l.match(/^(\d{1,3})\s*[.)\-–:]\s*(.*)$/)
    let t = m ? m[2].trim() : l
    if (m) { const j = W[d].findIndex(w => w.n === +m[1]); if (j >= 0) k = j }
    const w = W[d][k]; if (!w || !t) { k++; continue }
    const inp = document.querySelector('.dl input[data-id="' + w.id + '"]')
    if (inp) { inp.value = t; inp.dispatchEvent(new Event('input', { bubbles: true })); n++; dernier = inp }
    k++
  }
  if (dernier) { dernier.focus(); dernier.scrollIntoView({ block: 'nearest' }) }
  $('ed-etat').textContent = n + ' définition' + (n > 1 ? 's collées' : ' collée') + '. N’oublie pas d’enregistrer.'
}
for (const d of ['h', 'v']) {
  const box = $('d-' + d)
  box.addEventListener('input', e => {
    const i = e.target.closest('input'); if (!i) return
    const t = i.value.trim()
    if (t) clues[i.dataset.id] = i.value; else delete clues[i.dataset.id]
    i.parentElement.classList.toggle('vide', !t); dirty = true; manque()
  })
  box.addEventListener('focusin', e => { const i = e.target.closest('input'); if (i) { act = i.dataset.id; hl() } })
  box.addEventListener('paste', e => { const i = e.target.closest('input'); if (i) coller(e, i) })
  box.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const all = [...W.h, ...W.v], k = all.findIndex(w => w.id === act), n = all[k + 1]
    if (n) { act = n.id; hl(true) }
  })
}

// ---------- clics dans la grille ----------
{
  const g = $('ed-g'); let paint = null
  const at = e => { const t = document.elementFromPoint(e.clientX, e.clientY); return t && t.closest('#ed-g .c') }
  const put = (r, c, v) => {
    let n = 0
    const one = (a, b) => { if (black(a, b) !== v) { setBlack(a, b, v); el[a][b].classList.toggle('n', v); n++ } }
    one(r, c); if ($('ed-sym').checked) one(...mirror(meta(), r, c))
    return n
  }
  g.addEventListener('pointerdown', e => {
    const x = at(e); if (!x) return
    const r = +x.dataset.r, c = +x.dataset.c
    if (mode === 'sol') {
      if (black(r, c)) return
      e.preventDefault()
      solCur = solCur && solCur.r === r && solCur.c === c ? { r, c, d: solCur.d === 'h' ? 'v' : 'h' } : { r, c, d: (solCur && solCur.d) || 'h' }
      hl(); return
    }
    if (mode === 'def') {
      if (black(r, c)) return
      const k = r + ',' + c, cand = [...W.h, ...W.v].filter(w => w.cells.some(([a, b]) => a + ',' + b === k))
      if (!cand.length) return
      const i = cand.findIndex(w => w.id === act)
      act = cand[(i + 1) % cand.length].id
      e.preventDefault(); hl(true); return
    }
    e.preventDefault()
    paint = !black(r, c); put(r, c, paint)
    g.setPointerCapture(e.pointerId); renum()
  })
  g.addEventListener('pointermove', e => {
    if (paint === null) return
    const x = at(e); if (!x) return
    if (put(+x.dataset.r, +x.dataset.c, paint)) renum()
  })
  const stop = () => { if (paint !== null) { paint = null; dirty = true; grille() } }
  g.addEventListener('pointerup', stop); g.addEventListener('pointercancel', stop)
  g.style.touchAction = 'none'
}
// ---------- la solution ----------
function infoSol() {
  let reste = 0, diff = 0
  for (let i = 0; i < R * C; i++) {
    if (S[i] === ' ') reste++
    const l = lettres[Math.floor(i / C) + ',' + (i % C)]
    if (l && S[i] !== ' ' && S[i] !== '#' && l !== S[i]) diff++
  }
  $('ed-aide').textContent = (corrInfo ? 'Grille corrigée : ' + (corrInfo.cases - corrInfo.fautes) + '/' + corrInfo.cases + ' lettres justes. ' : '') +
    'Clique sur une case et tape la solution, le curseur avance tout seul. Clique encore sur la case (ou Entrée) pour changer de sens. ' +
    (reste ? reste + ' case' + (reste > 1 ? 's' : '') + ' à remplir' : 'Solution complète') + ' · ' + diff + ' différence' + (diff > 1 ? 's' : '') + ' avec la grille des joueurs.'
  return reste
}
function setS(r, c, ch) {
  const i = r * C + c; S = S.slice(0, i) + ch + S.slice(i + 1)
  el[r][c].querySelector('i.sl').textContent = ch.trim(); infoSol()
  garder()
}
let tGarde = null
function garder() {
  clearTimeout(tGarde)
  $('ed-etat').textContent = 'Brouillon…'
  tGarde = setTimeout(async () => {
    try { await api('/' + cur.id + '/brouillon', { method: 'PUT', body: JSON.stringify({ sol: S }) }); $('ed-etat').textContent = 'Brouillon gardé. Clique sur « Corriger la grille » quand tout est tapé.' }
    catch (e) { $('ed-etat').textContent = 'Brouillon pas gardé : ' + e.message }
  }, 700)
}
// case blanche suivante (dir = 1) ou précédente (dir = -1) dans le sens d'écriture
function voisine(r, c, d, dir) {
  const N = R * C
  let i = d === 'h' ? r * C + c : c * R + r
  for (let n = 0; n < N; n++) {
    i += dir; if (i < 0 || i >= N) return null
    const a = d === 'h' ? Math.floor(i / C) : i % R, b = d === 'h' ? i % C : Math.floor(i / R)
    if (!black(a, b)) return { r: a, c: b, d }
  }
  return null
}
addEventListener('keydown', e => {
  if (mode !== 'sol' || !solCur || e.target.closest('input,textarea') || e.metaKey || e.ctrlKey) return
  const { r, c, d } = solCur, k = e.key
  if (/^[a-z]$/i.test(k)) { setS(r, c, k.toUpperCase()); solCur = voisine(r, c, d, 1) || solCur }
  else if (k === 'Backspace') { if (S[r * C + c] !== ' ') setS(r, c, ' '); else { const p = voisine(r, c, d, -1); if (p) { solCur = p; setS(p.r, p.c, ' ') } } }
  else if (k === 'Delete' || k === ' ') setS(r, c, ' ')
  else if (k === 'Enter') solCur = { r, c, d: d === 'h' ? 'v' : 'h' }
  else if (k === 'ArrowRight' || k === 'ArrowLeft') solCur = voisine(r, c, 'h', k === 'ArrowRight' ? 1 : -1) || solCur
  else if (k === 'ArrowDown' || k === 'ArrowUp') solCur = { ...(voisine(r, c, 'v', k === 'ArrowDown' ? 1 : -1) || solCur), d }
  else return
  e.preventDefault(); hl()
})
$('ed-corr').onclick = async () => {
  if (!cur) return
  if (dirty) { alert('Enregistre d’abord la grille.'); return }
  const reste = infoSol()
  if (reste) { alert('Il reste ' + reste + ' case' + (reste > 1 ? 's' : '') + ' sans lettre.'); return }
  if (!confirm('Corriger la grille n° ' + cur.numero + ' ? Elle sera archivée : plus personne ne pourra y écrire, et les doutes seront effacés.')) return
  try {
    const k = await api('/' + cur.id + '/solution', { method: 'POST', body: JSON.stringify({ sol: S }) })
    corrInfo = k.corr; setMode('sol')
    $('ed-etat').textContent = 'Corrigée : ' + (k.corr.cases - k.corr.fautes) + '/' + k.corr.cases + ' lettres justes' + (k.corr.fautes ? '.' : ', double tamponnée !')
  } catch (err) { alert(err.message) }
}
$('ed-decorr').onclick = async () => {
  if (!cur || !confirm('Retirer la correction ? La grille redevient jouable. Les doutes effacés ne reviennent pas.')) return
  try { await api('/' + cur.id + '/solution', { method: 'DELETE' }); corrInfo = null; setMode('sol'); $('ed-etat').textContent = 'Correction retirée.' } catch (err) { alert(err.message) }
}
$('ed-vider').onclick = () => { if (!confirm('Blanchir toute la grille ?')) return; B = '0'.repeat(R * C); dirty = true; grille() }
$('f-taille').onclick = () => {
  const nr = Math.max(3, Math.min(40, +$('f-rows').value || 0)), nc = Math.max(3, Math.min(40, +$('f-cols').value || 0))
  let nb = ''
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) nb += r < R && c < C ? B[r * C + c] : '0'
  R = nr; C = nc; B = nb; $('f-rows').value = R; $('f-cols').value = C; dirty = true
  grille()
}
for (const id of ['f-source', 'f-date', 'f-saint', 'f-sam', 'f-dim', 'f-lune', 'f-soleil', 'f-prevue', 'f-pa']) $(id).addEventListener('input', () => dirty = true)

// ---------- enregistrer ----------
$('ed-save').onclick = async () => {
  const n = manque()
  if (n && !confirm(n + ' mot' + (n > 1 ? 's n’ont' : ' n’a') + ' pas encore de définition. Enregistrer quand même ?')) return
  if (cur && cur.blacks !== B && !confirm('Les cases noires ont changé : les lettres sur les cases devenues noires seront effacées. On y va ?')) return
  const keep = {}; for (const w of [...W.h, ...W.v]) if (clues[w.id]) keep[w.id] = clues[w.id].trim()
  const body = {
    rows: R, cols: C, blacks: B, clues: keep,
    source: $('f-source').value.trim(), date: $('f-date').value, saint: $('f-saint').value.trim(),
    meteoSam: $('f-sam').value.trim(), meteoDim: $('f-dim').value.trim(), lune: $('f-lune').value.trim(), soleil: $('f-soleil').value.trim(), prevue: $('f-prevue').value,
    annonces: $('f-pa').value.split('\n').map(s => s.trim()).filter(Boolean)
  }
  const btn = $('ed-save'); btn.disabled = true; $('ed-etat').textContent = 'On imprime…'
  try {
    const m = cur ? await api('/' + cur.id, { method: 'PUT', body: JSON.stringify(body) }) : await api('', { method: 'POST', body: JSON.stringify(body) })
    cur = m; dirty = false
    $('ed-titre').textContent = 'Grille n° ' + m.numero
    $('ed-voir').href = '/g/' + m.id; $('ed-voir').classList.remove('hide'); $('ed-annoncer').classList.remove('hide')
    $('ed-etat').innerHTML = 'Enregistré. Lien à partager : <span class="lien">' + esc(lien(m.id)) + '</span>'
  } catch (e) { $('ed-etat').textContent = 'Pas enregistré : ' + e.message }
  btn.disabled = false
}

liste()
