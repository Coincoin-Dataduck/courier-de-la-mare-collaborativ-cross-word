// Le Courrier de la Mare — la salle de rédaction (admin)
import { words, mirror } from './shared.js'
import { chargerImage, versCanvas, pourEnvoi, lireGrille, ranger, caler, motsDe, planche, rangerLignes, parLignes, lireTexte, reparer, versRomain as romain, LECTURE } from './capture.js?v=9'

const $ = id => document.getElementById(id)
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const secret = location.pathname.split('/').filter(Boolean)[1]
// On garde le secret sur l'appareil : le kiosque affiche alors le lien « La rédaction » (utile dans l'appli installée)
const CLE = 'cdlm-redaction'
try { localStorage.setItem(CLE, decodeURIComponent(secret)) } catch {}
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
$('vers-kiosque').onclick = e => { if (dirty && !confirm('Quitter sans enregistrer ?')) e.preventDefault() }
$('oublier').onclick = () => {
  if (!confirm('Oublier le mot de passe de la rédaction sur cet appareil ?')) return
  try { localStorage.removeItem(CLE) } catch {}
  location.replace('/')
}
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
  $('cap-ouvrir').textContent = m === 'sol' ? 'Lire la solution sur une capture…' : 'Lire une capture…'
  if (m !== capMode) { $('cap').classList.add('hide'); capMode = m }
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
let tGarde = null, gardeMsg = ''
function garder() {
  clearTimeout(tGarde)
  $('ed-etat').textContent = 'Brouillon…'
  tGarde = setTimeout(async () => {
    try { await api('/' + cur.id + '/brouillon', { method: 'PUT', body: JSON.stringify({ sol: S }) }); $('ed-etat').textContent = gardeMsg || 'Brouillon gardé. Clique sur « Corriger la grille » quand tout est tapé.'; gardeMsg = '' }
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

// ---------- lire une capture ----------
const LAPI = API.replace(/\/grids$/, '/lire')
let lu = null, capMode = null
function capReset() { lu = null; $('cap-drop').classList.remove('hide'); $('cap-coll').classList.toggle('hide', mode === 'sol'); $('cap-lit').classList.add('hide'); $('cap-res').classList.add('hide') }
$('cap-ouvrir').onclick = () => { $('cap').classList.toggle('hide'); capReset() }
$('cap-drop').onclick = () => $('cap-file').click()
$('cap-txt-ok').onclick = () => {
  const t = $('cap-txt').value; if (!t.trim()) return
  const d = lireTexte(t)
  if (!d.h.length && !d.v.length) { alert('Je ne trouve ni « Horizontalement » ni « Verticalement » suivis de numéros.'); return }
  lu = { g: null, defs: d, texte: true }; $('cap-drop').classList.add('hide'); $('cap-coll').classList.add('hide'); capMontrer('')
}
$('cap-drop').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('cap-file').click() } }
$('cap-file').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) capLire(f) }
$('cap-drop').ondragover = e => { e.preventDefault(); $('cap-drop').classList.add('sur') }
$('cap-drop').ondragleave = () => $('cap-drop').classList.remove('sur')
$('cap-drop').ondrop = e => { e.preventDefault(); $('cap-drop').classList.remove('sur'); const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/')); if (f) capLire(f) }
document.addEventListener('paste', e => {
  if ($('cap').classList.contains('hide') || $('vue-ed').classList.contains('hide')) return
  const it = [...((e.clipboardData && e.clipboardData.items) || [])].find(i => i.type.startsWith('image/'))
  if (!it) return
  e.preventDefault(); capLire(it.getAsFile())
})

// Taille donnée par des définitions « par ligne et par colonne » : dernier numéro romain × dernier numéro de colonne
function tailleDefs(d) {
  if (!d || !(d.h || []).length || !(d.v || []).length || !parLignes(d, 40, 40)) return null
  return { R: Math.max(...d.h.map(x => +x.n)), C: Math.max(...d.v.map(x => +x.n)) }
}
// Lit (ou relit) la grille sur la photo gardée dans lu.cv
function capAnalyser(opts) {
  const r = lireGrille(lu.cv, opts)
  lu.diag = r.diag; lu.g = r.B ? r : null; lu.retouches = 0
  if (lu.g) lu.coins = lu.g.coins.map(p => p.slice())
  else if (!lu.coins) lu.coins = defautCoins()
}
function defautCoins() { const w = lu.cv.width, h = lu.cv.height; return [[w * 0.25, h * 0.25], [w * 0.75, h * 0.25], [w * 0.25, h * 0.75], [w * 0.75, h * 0.75]] }

// Texte lu par l'IA → définitions ; null si on n'y trouve aucun numéro
function defsDuTexte(t) {
  let d = lireTexte(t)
  if (!d.h.length && !d.v.length) d = lireTexte('Horizontalement. ' + t) // titre de section non recopié
  return d.h.length || d.v.length ? d : null
}
async function capLire(f) {
  $('cap-drop').classList.add('hide'); $('cap-coll').classList.add('hide'); $('cap-lit').classList.remove('hide'); $('cap-res').classList.add('hide')
  let im
  try { im = await chargerImage(f) } catch (e) { capReset(); alert(e.message); return }
  if (mode === 'sol') return capLireSol(im)
  lu = { cv: versCanvas(im, 2400), photo: im.naturalWidth + '×' + im.naturalHeight, defs: null }
  capAnalyser({})
  let err = ''
  const image = pourEnvoi(im)
  const demander = async mode => {
    const corps = JSON.stringify(mode ? { image, mode } : { image })
    let r
    try { r = await fetch(LAPI, { method: 'POST', headers: { 'content-type': 'application/json' }, body: corps }) }
    catch {
      // connexion coupée (« Load failed » sur iPhone) : on réessaie une fois
      await new Promise(f => setTimeout(f, 1500))
      try { r = await fetch(LAPI, { method: 'POST', headers: { 'content-type': 'application/json' }, body: corps }) }
      catch { throw new Error('la connexion a été coupée pendant la lecture (garde l’écran allumé et l’appli ouverte, puis réessaie)') }
    }
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error || 'erreur ' + r.status)
    return d
  }
  try {
    const d = await demander()
    if (typeof d.texte === 'string') { lu.texteIA = d.texte; lu.defs = defsDuTexte(d.texte) }
    else lu.defs = reparer(d)
    // texte lu sans numéros reconnaissables : on essaie l'ancienne lecture (l'IA range elle-même)
    if (!lu.defs && typeof d.texte === 'string' && d.texte.length > 40) {
      try { const d2 = reparer(await demander('json')); if ((d2.h || []).length + (d2.v || []).length) { lu.defs = d2; lu.secours = true } } catch {}
    }
  } catch (e) { err = e.message }
  lu.tdefs = tailleDefs(lu.defs)
  // pas de grille trouvée, mais les définitions donnent la taille : on la propose pour la pose à la main
  lu.R = lu.g ? lu.g.R : lu.tdefs ? lu.tdefs.R : R
  lu.C = lu.g ? lu.g.C : lu.tdefs ? lu.tdefs.C : C
  capMontrer(err)
}

function capMini(g) {
  const cs = Math.max(8, Math.min(18, Math.floor(300 / Math.max(g.R, g.C)))), dt = new Set(g.douteuses.map(([r, c]) => r + ',' + c))
  let h = ''
  for (let r = 0; r < g.R; r++) for (let c = 0; c < g.C; c++) h += '<i data-r="' + r + '" data-c="' + c + '" class="' + (g.B[r * g.C + c] === '1' ? 'n' : '') + (dt.has(r + ',' + c) ? ' dt' : '') + '"></i>'
  return '<div class="cap-mg" style="--cs:' + cs + 'px;grid-template-columns:repeat(' + g.C + ',var(--cs))">' + h + '</div>'
}
function capCol(t, L) {
  return '<div><h5>' + t + ' · ' + L.length + '</h5>' + L.slice(0, 6).map(x => '<p><b>' + x.n + '.</b>' + esc(x.t) + '</p>').join('') + (L.length > 6 ? '<p style="color:var(--grey)">… ' + (L.length - 6) + ' autres</p>' : '') + '</div>'
}
function capMontrer(err) {
  const dh = (lu.defs && lu.defs.h) || [], dv = (lu.defs && lu.defs.v) || [], nd = dh.length + dv.length
  const pl = nd && parLignes(lu.defs, lu.g ? lu.g.R : R, lu.g ? lu.g.C : C)
  lu.err = err
  let h = '<div class="cap-cols">'
  if (lu.cv) {
    h += '<div class="cap-g"><canvas id="cap-cv" class="cap-cv"></canvas>' +
      '<p class="cap-aide">Touche une case pour la noircir ou la blanchir. Si la grille est mal posée, fais glisser les ronds rouges sur ses quatre coins.</p>' +
      '<div class="cap-taille">Taille <input type="number" id="cap-R" min="3" max="40" value="' + lu.R + '"> × <input type="number" id="cap-C" min="3" max="40" value="' + lu.C + '"><button class="pbtn" id="cap-relire">Relire</button></div>' +
      '<div id="cap-mini"></div><p class="cap-diag" id="cap-diag"></p></div>'
  }
  h += '<div class="cap-r"><h4 id="cap-titre"></h4><p class="cap-s" id="cap-notes"></p>'
  h += '<label class="cap-ck"><input type="checkbox" id="cap-n"> Placer les cases noires</label>'
  h += '<label class="cap-ck"><input type="checkbox" id="cap-d"' + (nd ? ' checked' : ' disabled') + '> Remplir les définitions</label>'
  if (nd) {
    h += '<div class="cap-fmt"><label class="cap-ck"><input type="radio" name="cap-f" value="mot"' + (pl ? '' : ' checked') + '> Un numéro par mot (1, 2, 3… dans les cases)</label>' +
      '<label class="cap-ck"><input type="radio" name="cap-f" value="ligne"' + (pl ? ' checked' : '') + '> Un numéro par ligne et par colonne (I, II… et 1, 2…, plusieurs définitions par numéro, comme Laclos ou Le Monde)</label></div>'
    h += '<div class="cap-two">' + capCol('Horizontalement', pl ? dh.map(x => ({ ...x, n: romain(x.n) })) : dh) + capCol('Verticalement', dv) + '</div>'
  }
  if (typeof lu.texteIA === 'string') h += '<details class="cap-coll cap-tia"' + (lu.tiaOuvert || !nd ? ' open' : '') + '><summary>Texte lu sur la photo (corrige-le si une définition manque)</summary><textarea id="cap-tia" rows="10">' + esc(lu.texteIA) + '</textarea><button class="pbtn" id="cap-tia-ok">Relire ce texte</button></details>'
  h += '<div class="cap-acts"><button class="pbtn cap-vert" id="cap-ok">Mettre dans la grille</button><button class="pbtn" id="cap-non">Annuler</button><button class="pbtn" id="cap-autre">Une autre image</button><span class="cap-s">Tu pourras tout retoucher avant d’enregistrer.</span></div></div></div>'
  $('cap-lit').classList.add('hide'); $('cap-res').innerHTML = h; $('cap-res').classList.remove('hide')
  if (lu.cv) capVue()
  capMaj()
}
// Met à jour ce qui dépend de la grille lue : titre, remarques, photo annotée, petite grille, diagnostic
function capMaj() {
  const g = lu.g, nd = ((lu.defs && lu.defs.h) || []).length + ((lu.defs && lu.defs.v) || []).length
  const titre = [], notes = []
  if (g) titre.push(g.R + ' × ' + g.C, g.nb + ' case' + (g.nb > 1 ? 's noires' : ' noire'))
  if (nd) {
    const pl = parLignes(lu.defs, g ? g.R : R, g ? g.C : C), dh = lu.defs.h || [], dv = lu.defs.v || []
    titre.push(pl ? dh.length + ' lignes, ' + dv.length + ' colonnes de définitions' : nd + ' définition' + (nd > 1 ? 's' : ''))
  }
  if (lu.texte) notes.push('Les définitions iront dans la grille déjà dessinée (' + R + ' × ' + C + ').')
  else if (!g) notes.push('Pas de grille repérée' + (lu.diag && lu.diag.echec && lu.diag.echec !== 'pas de grille trouvée' ? ' (' + lu.diag.echec + ')' : '') + '. Pose les quatre ronds rouges sur les coins de la grille, vérifie la taille, puis « Relire ».')
  else {
    if (g.R !== R || g.C !== C) notes.push('La grille de l’éditeur passera en ' + g.R + ' × ' + g.C + '.')
    if (lu.diag.ecart) notes.push('Attention : ' + lu.diag.ecart + '.')
    if (lu.tdefs) {
      if (lu.tdefs.R === g.R && lu.tdefs.C === g.C) notes.push('Taille confirmée par les définitions (' + romain(g.R) + ' lignes, ' + g.C + ' colonnes).')
      else notes.push('Les définitions vont jusqu’à ' + romain(lu.tdefs.R) + ' et ' + lu.tdefs.C + ', soit ' + lu.tdefs.R + ' × ' + lu.tdefs.C + ' : vérifie la taille (il manque peut-être un numéro dans la lecture des définitions).')
    }
    if (g.douteuses.length) notes.push('Les cases entourées en vert sont peu nettes sur l’image : jette un œil.')
    if (lu.retouches) notes.push(lu.retouches + ' case' + (lu.retouches > 1 ? 's retouchées' : ' retouchée') + ' à la main.')
  }
  if (lu.secours) notes.push('Le texte lu ne se découpait pas : définitions rangées par l’IA, vérifie-les.')
  else if (typeof lu.texteIA === 'string' && !nd) notes.push('Le texte lu sur la photo ne contient pas de numéros reconnus : regarde-le ci-dessous, corrige-le puis « Relire ce texte ».')
  if (lu.defs && lu.defs.repare) notes.push('Définitions regroupées par la lecture, redécoupées par numéro (' + lu.defs.repare + ').')
  if (lu.err) notes.push('Définitions non lues : ' + lu.err + '.')
  else if (!nd && !lu.texte) notes.push('Pas de définitions trouvées.')
  $('cap-titre').textContent = titre.join(' · ') || 'Rien trouvé sur l’image'
  $('cap-notes').textContent = notes.join(' ')
  $('cap-n').checked = !!g; $('cap-n').disabled = !g
  $('cap-ok').disabled = !(g || nd)
  if (!lu.cv) return
  $('cap-mini').innerHTML = g ? capMini(g) : ''
  const d = lu.diag || {}
  $('cap-diag').textContent = ['lecture ' + LECTURE, 'photo ' + lu.photo, d.image && d.image !== lu.photo ? 'réduite à ' + d.image : '', 'analysée en ' + d.travail,
    d.cases ? d.cases + ' cases blanches repérées' : '', d.trouve && g && d.trouve !== g.R + '×' + g.C ? 'quadrillage trouvé ' + d.trouve : '', d.coins === 'à la main' ? 'coins posés à la main' : ''].filter(Boolean).join(' · ')
  capDessiner()
}

// ---- la photo annotée : maillage, cases noires, coins déplaçables ----
let capDrag = null, capTap = null
function capVue() {
  // cadrage : la grille et une marge, ou toute la photo si rien n'a été trouvé
  const w = lu.cv.width, h = lu.cv.height
  if (lu.g) {
    const b = lu.g.box, mx = (b.x1 - b.x0) * 0.12, my = (b.y1 - b.y0) * 0.12
    lu.vue = { x0: Math.max(0, b.x0 - mx), y0: Math.max(0, b.y0 - my), x1: Math.min(w, b.x1 + mx), y1: Math.min(h, b.y1 + my) }
  } else lu.vue = { x0: 0, y0: 0, x1: w, y1: h }
  const cv = $('cap-cv'), larg = Math.min(560, cv.parentElement.clientWidth || 320), dpr = window.devicePixelRatio || 1
  const v = lu.vue, k = larg / (v.x1 - v.x0)
  cv.style.width = larg + 'px'; cv.style.height = Math.round((v.y1 - v.y0) * k) + 'px'
  cv.width = Math.round(larg * dpr); cv.height = Math.round((v.y1 - v.y0) * k * dpr)
  lu.k = k
  cv.onpointerdown = capDown; cv.onpointermove = capMove; cv.onpointerup = capUp; cv.onpointercancel = () => { capDrag = null; capTap = null }
}
const capEcran = p => [(p[0] - lu.vue.x0) * lu.k, (p[1] - lu.vue.y0) * lu.k] // pixels de la photo -> pixels CSS du canvas
const capPhoto = p => [p[0] / lu.k + lu.vue.x0, p[1] / lu.k + lu.vue.y0]
function capDessiner(sansMaille) {
  const cv = $('cap-cv'); if (!cv) return
  const x = cv.getContext('2d'), dpr = cv.width / parseFloat(cv.style.width), v = lu.vue
  x.setTransform(1, 0, 0, 1, 0, 0)
  x.drawImage(lu.cv, v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0, 0, 0, cv.width, cv.height)
  x.setTransform(dpr, 0, 0, dpr, 0, 0)
  const g = lu.g
  if (g && !sansMaille) {
    const M = g.maille.map(row => row.map(capEcran))
    const quad = (r, c) => { x.beginPath(); x.moveTo(...M[r][c]); x.lineTo(...M[r][c + 1]); x.lineTo(...M[r + 1][c + 1]); x.lineTo(...M[r + 1][c]); x.closePath() }
    x.fillStyle = 'rgba(196,26,18,.42)'
    for (let r = 0; r < g.R; r++) for (let c = 0; c < g.C; c++) if (g.B[r * g.C + c] === '1') { quad(r, c); x.fill() }
    x.strokeStyle = '#1f8a4c'; x.lineWidth = 2.5
    for (const [r, c] of g.douteuses) { quad(r, c); x.stroke() }
    x.strokeStyle = 'rgba(196,26,18,.9)'; x.lineWidth = 1.2
    x.beginPath()
    for (let k = 0; k <= g.R; k++) { x.moveTo(...M[k][0]); for (let l = 1; l <= g.C; l++) x.lineTo(...M[k][l]) }
    for (let l = 0; l <= g.C; l++) { x.moveTo(...M[0][l]); for (let k = 1; k <= g.R; k++) x.lineTo(...M[k][l]) }
    x.stroke()
  }
  // le cadre entre les coins, et les coins
  const P = lu.coins.map(capEcran)
  if (!g || sansMaille) { x.strokeStyle = 'rgba(196,26,18,.9)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(...P[0]); x.lineTo(...P[1]); x.lineTo(...P[3]); x.lineTo(...P[2]); x.closePath(); x.stroke() }
  for (const p of P) { x.beginPath(); x.arc(p[0], p[1], 11, 0, 7); x.fillStyle = 'rgba(255,255,255,.55)'; x.fill(); x.lineWidth = 2.5; x.strokeStyle = '#c41a12'; x.stroke() }
}
function capPos(e) { const r = $('cap-cv').getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
function capDown(e) {
  const p = capPos(e), P = lu.coins.map(capEcran)
  let i = -1, dm = 26
  P.forEach((q, j) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < dm) { dm = d; i = j } })
  if (i >= 0) { capDrag = { i, d: [P[i][0] - p[0], P[i][1] - p[1]] }; $('cap-cv').setPointerCapture(e.pointerId); e.preventDefault() }
  else capTap = p
}
function capMove(e) {
  if (!capDrag) return
  e.preventDefault()
  const p = capPos(e)
  lu.coins[capDrag.i] = capPhoto([p[0] + capDrag.d[0], p[1] + capDrag.d[1]])
  capDessiner(true)
}
function capUp(e) {
  if (capDrag) { capDrag = null; capRelire(true); return }
  if (!capTap || !lu.g) return
  const p = capPos(e), t = capTap; capTap = null
  if (Math.hypot(p[0] - t[0], p[1] - t[1]) > 8) return
  // la case sous le doigt : celle dont le quadrilatère contient le point
  const g = lu.g, q = capPhoto(p)
  for (let r = 0; r < g.R; r++) for (let c = 0; c < g.C; c++) {
    const M = g.maille
    if (dansQuad(q, M[r][c], M[r][c + 1], M[r + 1][c + 1], M[r + 1][c])) return capBasculer(r, c)
  }
}
function dansQuad(p, ...Q) {
  let s = 0
  for (let i = 0; i < 4; i++) { const a = Q[i], b = Q[(i + 1) % 4], z = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); if (z !== 0) { if (s && Math.sign(z) !== s) return false; s = Math.sign(z) } }
  return true
}
function capBasculer(r, c) {
  const g = lu.g, i = r * g.C + c, noire = g.B[i] !== '1'
  g.B = g.B.slice(0, i) + (noire ? '1' : '0') + g.B.slice(i + 1)
  g.nb += noire ? 1 : -1
  g.douteuses = g.douteuses.filter(([a, b]) => a !== r || b !== c)
  lu.retouches = (lu.retouches || 0) + 1
  capMaj()
}
// Relit avec la taille des cases du formulaire, et les coins posés à la main si on les a bougés
function capRelire(coinsMain) {
  const nR = +$('cap-R').value, nC = +$('cap-C').value
  if (!(nR >= 3 && nR <= 40 && nC >= 3 && nC <= 40)) { alert('La taille va de 3 à 40.'); return }
  if (coinsMain) lu.main = true
  lu.R = nR; lu.C = nC
  $('cap-diag').textContent = 'Je relis…'
  setTimeout(() => {
    const avant = lu.g
    capAnalyser(lu.main ? { R: nR, C: nC, coins: lu.coins } : { R: nR, C: nC })
    if (lu.g && !avant) capVue() // première grille trouvée : on recadre dessus
    capMaj()
  }, 20)
}
$('cap-res').onclick = e => {
  const id = e.target.id
  if (id === 'cap-non') { $('cap').classList.add('hide'); capReset() }
  else if (id === 'cap-autre') capReset()
  else if (id === 'cap-ok') capMettre()
  else if (id === 'cap-sol') capMettreSol()
  else if (id === 'cap-relire') capRelire(false)
  else if (id === 'cap-tia-ok') {
    const t = $('cap-tia').value, d = defsDuTexte(t)
    if (!d) { alert('Je ne trouve ni « Horizontalement » ni « Verticalement » suivis de numéros.'); return }
    lu.texteIA = t; lu.defs = d; lu.tdefs = tailleDefs(d); lu.tiaOuvert = true; capMontrer('')
  }
  else if (e.target.matches('.cap-mg i[data-r]') && lu && lu.g) capBasculer(+e.target.dataset.r, +e.target.dataset.c)
}
$('cap-res').onkeydown = e => { if (e.key === 'Enter' && (e.target.id === 'cap-R' || e.target.id === 'cap-C')) { e.preventDefault(); capRelire(false) } }
function capMettre() {
  const n = $('cap-n').checked && lu.g, d = $('cap-d').checked && lu.defs
  if (!n && !d) return
  if (n && B.includes('1') && !confirm('Remplacer les cases noires déjà posées ?')) return
  if (d && Object.keys(clues).length && !confirm('Remplacer les définitions déjà écrites ?')) return
  const msg = []
  if (n) { R = lu.g.R; C = lu.g.C; B = lu.g.B; $('f-rows').value = R; $('f-cols').value = C; grille(); msg.push(lu.g.nb + ' cases noires placées') }
  if (d) {
    const f = document.querySelector('input[name="cap-f"]:checked'), lig = f && f.value === 'ligne'
    const r = lig ? rangerLignes(W, lu.defs) : ranger(W, lu.defs); clues = r.clues; defs()
    msg.push(r.n + ' définition' + (r.n > 1 ? 's rangées' : ' rangée'))
    if (r.perdues.length) msg.push(r.perdues.length + ' à vérifier, sans mot à ce numéro (' + r.perdues.slice(0, 6).join(', ') + (r.perdues.length > 6 ? '…' : '') + ')')
    if (r.ecarts && r.ecarts.length) msg.push('à relire, le compte ne tombe pas juste : ' + r.ecarts.slice(0, 6).join(' ; ') + (r.ecarts.length > 6 ? '…' : ''))
  }
  dirty = true; setMode('def'); $('cap').classList.add('hide'); capReset()
  $('ed-etat').textContent = msg.join(' · ') + '. N’oublie pas d’enregistrer.'
}

// ---------- lire la solution sur une capture (mode Solution) ----------
function capErreur(t) {
  $('cap-lit').classList.add('hide')
  $('cap-res').innerHTML = '<div class="cap-r"><h4>Rien à importer</h4><p class="cap-s">' + esc(t) + '</p><div class="cap-acts"><button class="pbtn" id="cap-autre">Une autre image</button><button class="pbtn" id="cap-non">Annuler</button></div></div>'
  $('cap-res').classList.remove('hide')
}
async function capLireSol(im) {
  const cv = versCanvas(im, 2400)
  let g = lireGrille(cv)
  if (!g.B) return capErreur('Pas de grille repérée sur l’image (' + g.diag.echec + ').')
  let k = caler(g, R, C, B)
  if (!k || k.score < 0.9) { // la photo montre peut-être toute la grille, mais le quadrillage s'est trompé de taille
    const g2 = lireGrille(cv, { R, C }), k2 = g2.B && caler(g2, R, C, B)
    if (k2 && (!k || k2.score > k.score)) { g = g2; k = k2 }
  }
  if (!k || k.score < 0.9) return capErreur('Les cases noires de la capture (' + g.R + ' × ' + g.C + ') ne correspondent pas à cette grille (' + R + ' × ' + C + '). Vérifie que c’est bien la solution de la grille n° ' + (cur ? cur.numero : '') + '.')
  // l'IA ne voit que des mots isolés, horizontaux puis verticaux, par planches de 18
  const lots = []
  for (const d of ['h', 'v']) { const L = motsDe(g, d); for (let i = 0; i < L.length; i += 18) lots.push(L.slice(i, i + 18)) }
  let rep
  try {
    rep = await Promise.all(lots.map(async mots => {
      const r = await fetch(LAPI, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'mots', image: planche(cv, g, mots), longueurs: mots.map(m => m.length) }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'erreur ' + r.status)
      return d.mots
    }))
  } catch (e) { return capErreur('Lettres non lues : ' + e.message + '.') }
  // chaque case reçoit les lettres lues dans les deux sens ; on garde si d'accord (ou un seul sens lu)
  const vu = {}
  lots.forEach((mots, j) => mots.forEach((m, i) => { const w = rep[j][i]; if (w) m.forEach(([r, c], n) => { if (w[n] !== '?') (vu[r + ',' + c] ||= []).push(w[n]) }) }))
  let sol = '', desac = 0
  const doute = new Set()
  for (let r = 0; r < g.R; r++) for (let c = 0; c < g.C; c++) {
    if (g.B[r * g.C + c] === '1') { sol += '#'; continue }
    const v = vu[r + ',' + c] || []
    if (v.length && v.every(x => x === v[0])) sol += v[0]
    else { sol += ' '; if (v.length) { desac++; doute.add(r * g.C + c) } }
  }
  lu = { sol, g, k }
  const blancs = g.B.split('').filter(x => x === '0').length, lues = sol.split('').filter(x => /[A-Z]/.test(x)).length
  const notes = []
  if (g.R < R) notes.push('La capture ne montre que ' + g.R + ' lignes sur ' + R + ' : ' + (R - g.R > 1 ? 'les autres restent' : 'la dernière reste') + ' à taper.')
  if (g.C < C) notes.push('La capture ne montre que ' + g.C + ' colonnes sur ' + C + '.')
  if (k.score < 1) notes.push('Quelques cases noires diffèrent de ta grille : vérifie.')
  if (desac) notes.push(desac + ' case' + (desac > 1 ? 's' : '') + ' entourée' + (desac > 1 ? 's' : '') + ' en vert : l’horizontal et le vertical ne disent pas pareil, laissée' + (desac > 1 ? 's' : '') + ' vide' + (desac > 1 ? 's' : '') + '.')
  if (lues + desac < blancs) notes.push((blancs - lues - desac) + ' autre' + (blancs - lues - desac > 1 ? 's cases illisibles' : ' case illisible') + '.')
  if (S.split('').some(x => /[A-Z]/.test(x))) notes.push('Les lettres déjà tapées seront remplacées par celles lues.')
  const cs = Math.max(10, Math.min(20, Math.floor(320 / Math.max(g.R, g.C))))
  let mg = ''
  for (let i = 0; i < g.R * g.C; i++) mg += g.B[i] === '1' ? '<i class="n"></i>' : '<i class="vu' + (doute.has(i) ? ' dt' : '') + '">' + sol[i].trim() + '</i>'
  $('cap-res').innerHTML = '<div class="cap-cols"><div><div class="cap-mg" style="--cs:' + cs + 'px;grid-template-columns:repeat(' + g.C + ',var(--cs))">' + mg + '</div></div><div class="cap-r"><h4>Solution lue · ' + lues + ' lettres sur ' + blancs + '</h4><p class="cap-s">' + esc(notes.join(' ')) + '</p>' +
    '<div class="cap-acts"><button class="pbtn cap-vert" id="cap-sol">Mettre dans la solution</button><button class="pbtn" id="cap-non">Annuler</button><button class="pbtn" id="cap-autre">Une autre image</button><span class="cap-s">Rien n’est corrigé avant « Corriger la grille ».</span></div></div></div>'
  $('cap-lit').classList.add('hide'); $('cap-res').classList.remove('hide')
}
function capMettreSol() {
  const { sol, g, k } = lu; let n = 0
  const a = S.split('')
  for (let r = 0; r < g.R; r++) for (let c = 0; c < g.C; c++) {
    const ch = sol[r * g.C + c], i = (r + k.dr) * C + c + k.dc
    if (B[i] !== '1' && /[A-Z]/.test(ch)) { a[i] = ch; n++ }
  }
  S = a.join('')
  $('cap').classList.add('hide'); capReset()
  gardeMsg = n + ' lettres mises dans la solution (brouillon gardé). Relis, complète, puis « Corriger la grille ».'
  grille(); setMode('sol'); garder()
}
