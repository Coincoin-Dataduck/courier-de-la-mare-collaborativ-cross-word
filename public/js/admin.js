// Le Courrier de la Mare — la salle de rédaction (admin)
import { words, splitDefs } from './shared.js'

const $ = id => document.getElementById(id)
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const secret = location.pathname.split('/').filter(Boolean)[1]
const API = '/api/admin/' + encodeURIComponent(secret) + '/grids'
const ANNONCES = [
  'Vends paille. 25 francs les 12 brins.',
  'Crapaud cherche princesse. S’adresser à la mare.',
  'Canard cherche ses lunettes. Aperçues pour la dernière fois près de la mare. Prévenir la grenouille si vous les avez retrouvées.',
  'Astra la corgi cherche partenaire de jeu. Cardio important exigé.',
  'Rocket le corgi cherche coussin près du feu, confortable et sans enquiquineur.'
]

let cur = null       // grille en cours d'édition
let R = 32, C = 35, B = ''
let dirty = false

async function api(path = '', opt = {}) {
  const r = await fetch(API + path, { ...opt, headers: { 'content-type': 'application/json' } })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || ('Erreur ' + r.status))
  return r.json()
}
const lien = id => location.origin + '/g/' + id
const fdate = d => d ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

// ---------- la liste ----------
async function liste() {
  $('vue-ed').classList.add('hide'); $('vue-liste').classList.remove('hide')
  history.replaceState(null, '', location.pathname)
  let gs = []
  try { gs = await api() } catch (e) { $('vide').textContent = 'Impossible de lire la liste : ' + e.message; return }
  $('cpt').textContent = gs.length + ' grille' + (gs.length > 1 ? 's' : '')
  $('vide').textContent = gs.length ? '' : 'Aucune grille pour l’instant. Le canard attend.'
  $('grilles').innerHTML = gs.map(g => '<tr><td><b>' + g.numero + '</b></td><td>' + fdate(g.date || g.created) + '</td><td class="mob">' + g.rows + ' × ' + g.cols + '</td><td class="mob">' + esc(g.source) + '</td>' +
    '<td><a class="lien" href="/g/' + g.id + '" target="_blank" rel="noopener">' + esc(lien(g.id)) + '</a> <button class="pbtn" data-copy="' + g.id + '">Copier</button></td>' +
    '<td style="text-align:right;white-space:nowrap"><button class="pbtn" data-ed="' + g.id + '">Modifier</button> <button class="pbtn rouge" data-del="' + g.id + '" data-n="' + g.numero + '">Supprimer</button></td></tr>').join('')
}
$('grilles').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return
  if (b.dataset.copy) { try { await navigator.clipboard.writeText(lien(b.dataset.copy)); b.textContent = 'Copié' } catch { prompt('Lien à copier', lien(b.dataset.copy)) } setTimeout(() => b.textContent = 'Copier', 1500) }
  if (b.dataset.ed) ouvrir(b.dataset.ed)
  if (b.dataset.del) {
    if (!confirm('Supprimer la grille n° ' + b.dataset.n + ' pour de bon ? Les joueurs perdront tout.')) return
    try { await api('/' + b.dataset.del, { method: 'DELETE' }); liste() } catch (err) { alert(err.message) }
  }
}
$('nouvelle').onclick = () => ouvrir(null)
$('retour').onclick = () => { if (dirty && !confirm('Quitter sans enregistrer ?')) return; dirty = false; liste() }
addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = '' } })

// ---------- l'éditeur ----------
async function ouvrir(id) {
  let m = null, info = null
  if (id) { try { info = await api('/' + id); m = info.meta } catch (e) { alert(e.message); return } }
  cur = m
  R = m ? m.rows : 32; C = m ? m.cols : 35; B = m ? m.blacks : '0'.repeat(R * C)
  $('ed-titre').textContent = m ? 'Grille n° ' + m.numero : 'Nouvelle grille'
  $('f-rows').value = R; $('f-cols').value = C
  $('f-h').value = m ? lignes(m.defsH) : ''
  $('f-v').value = m ? lignes(m.defsV) : ''
  $('f-source').value = m ? m.source : ''
  $('f-date').value = m ? m.date : new Date().toISOString().slice(0, 10)
  $('f-saint').value = m ? m.saint : ''
  $('f-sam').value = m ? m.meteoSam : ''; $('f-dim').value = m ? m.meteoDim : ''
  $('f-lune').value = m ? m.lune : ''; $('f-soleil').value = m ? m.soleil : ''
  $('f-pa').value = (m ? m.annonces : ANNONCES).join('\n')
  $('ed-voir').classList.toggle('hide', !m); if (m) $('ed-voir').href = '/g/' + m.id
  $('ed-etat').textContent = info && info.filled ? 'Attention : ' + info.filled + ' lettres déjà posées par ' + info.players + ' joueur' + (info.players > 1 ? 's' : '') + '. Changer les cases noires efface les lettres concernées.' : ''
  $('vue-liste').classList.add('hide'); $('vue-ed').classList.remove('hide')
  dirty = false
  grille(); verif(); scrollTo(0, 0)
}
// une ligne par numéro : "1. Déf. Déf."
const lignes = arr => arr.map((t, i) => (i + 1) + '. ' + (t || '').replace(/^\s*\d+\s*[.)\-:]\s*/, '')).join('\n')
function lire(txt, n) {
  const out = Array(n).fill(''), ls = txt.split('\n')
  let auto = 0
  for (const l of ls) {
    if (!l.trim()) continue
    const m = l.match(/^\s*(\d+)\s*[.)\-:]\s*(.*)$/)
    if (m) { const i = +m[1] - 1; if (i >= 0 && i < n) { out[i] = m[2].trim(); auto = i + 1 } }
    else if (auto < n) out[auto++] = l.trim()
  }
  return out
}
const black = (r, c) => B[r * C + c] === '1'
function setBlack(r, c, v) { const i = r * C + c; B = B.slice(0, i) + (v ? '1' : '0') + B.slice(i + 1) }

function grille() {
  const g = $('ed-g'), cs = Math.max(14, Math.min(26, Math.floor(($('ed-g').parentElement.clientWidth - 40) / C)))
  g.style.setProperty('--cs', cs + 'px'); g.style.setProperty('--lab', '22px')
  g.style.gridTemplateColumns = 'var(--lab) repeat(' + C + ',var(--cs))'
  let h = '<div></div>'
  for (let c = 0; c < C; c++) h += '<div class="lab col">' + (c + 1) + '</div>'
  for (let r = 0; r < R; r++) {
    h += '<div class="lab row">' + (r + 1) + '</div>'
    for (let c = 0; c < C; c++) {
      const cl = ['c']; if (black(r, c)) cl.push('n'); if (r === 0) cl.push('top'); if (c === 0) cl.push('left'); if (c === C - 1) cl.push('right'); if (r === R - 1) cl.push('bot')
      h += '<div class="' + cl.join(' ') + '" data-r="' + r + '" data-c="' + c + '"></div>'
    }
  }
  g.innerHTML = h
  compte()
}
function compte() { const n = B.split('').filter(x => x === '1').length; $('ed-compte').textContent = n + ' cases noires sur ' + R * C }

// clic ou glisser pour noircir / blanchir
{
  const g = $('ed-g'); let paint = null
  const at = e => { const t = document.elementFromPoint(e.clientX, e.clientY); return t && t.closest('#ed-g .c') }
  g.addEventListener('pointerdown', e => {
    const c = at(e); if (!c) return
    e.preventDefault()
    const r = +c.dataset.r, cc = +c.dataset.c
    paint = !black(r, cc); setBlack(r, cc, paint); c.classList.toggle('n', paint)
    g.setPointerCapture(e.pointerId)
  })
  g.addEventListener('pointermove', e => {
    if (paint === null) return
    const c = at(e); if (!c) return
    const r = +c.dataset.r, cc = +c.dataset.c
    if (black(r, cc) !== paint) { setBlack(r, cc, paint); c.classList.toggle('n', paint) }
  })
  const stop = () => { if (paint !== null) { paint = null; dirty = true; compte(); verif() } }
  g.addEventListener('pointerup', stop); g.addEventListener('pointercancel', stop)
  g.style.touchAction = 'none'
}
$('ed-vider').onclick = () => { if (!confirm('Blanchir toute la grille ?')) return; B = '0'.repeat(R * C); dirty = true; grille(); verif() }
$('f-taille').onclick = () => {
  const nr = Math.max(3, Math.min(40, +$('f-rows').value || 0)), nc = Math.max(3, Math.min(40, +$('f-cols').value || 0))
  let nb = ''
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) nb += r < R && c < C ? B[r * C + c] : '0'
  R = nr; C = nc; B = nb; $('f-rows').value = R; $('f-cols').value = C; dirty = true
  grille(); verif()
}

// vérification ligne par ligne : autant de définitions que de mots ?
function verif() {
  const meta = { rows: R, cols: C, blacks: B }, W = words(meta)
  const dh = lire($('f-h').value, R), dv = lire($('f-v').value, C)
  const bloc = (d, n, dd) => {
    let h = '', bad = 0
    for (let i = 0; i < n; i++) {
      const ws = W[d].filter(w => w.line === i), nd = splitDefs(dd[i]).length
      if (!ws.length && !nd) continue
      const ok = ws.length === nd
      if (!ok) bad++
      h += '<p class="' + (ok ? 'ok' : 'ko') + '"><b>' + (i + 1) + '.</b><span>' + (ok ? '✓ ' + nd + ' définition' + (nd > 1 ? 's' : '') : nd + ' définition' + (nd > 1 ? 's' : '') + ' pour ' + ws.length + ' mot' + (ws.length > 1 ? 's' : '')) + '</span><em>' + ws.map(w => w.cells.length).join(', ') + (ws.length ? ' lettres' : '') + '</em></p>'
    }
    return { h, bad }
  }
  const a = bloc('h', R, dh), b = bloc('v', C, dv)
  $('v-h').innerHTML = a.h; $('v-v').innerHTML = b.h
  const bad = a.bad + b.bad
  $('ed-save').dataset.bad = bad
  return bad
}
for (const id of ['f-h', 'f-v']) $(id).addEventListener('input', () => { dirty = true; verif() })
for (const id of ['f-source', 'f-date', 'f-saint', 'f-sam', 'f-dim', 'f-lune', 'f-soleil', 'f-pa']) $(id).addEventListener('input', () => dirty = true)

// surligner dans la grille la ligne où se trouve le curseur
function hl(d) {
  const ta = $(d === 'h' ? 'f-h' : 'f-v'), n = ta.value.slice(0, ta.selectionStart).split('\n').length
  const line = ta.value.split('\n')[n - 1] || '', m = line.match(/^\s*(\d+)/), i = (m ? +m[1] : n) - 1
  document.querySelectorAll('#ed-g .c.hl').forEach(e => e.classList.remove('hl'))
  document.querySelectorAll('#ed-g .c').forEach(e => { if ((d === 'h' ? +e.dataset.r : +e.dataset.c) === i) e.classList.add('hl') })
}
for (const d of ['h', 'v']) { const ta = $('f-' + d); for (const ev of ['click', 'keyup', 'focus']) ta.addEventListener(ev, () => hl(d)) ; ta.addEventListener('blur', () => document.querySelectorAll('#ed-g .c.hl').forEach(e => e.classList.remove('hl'))) }

$('ed-save').onclick = async () => {
  const bad = verif()
  if (bad && !confirm(bad + ' ligne' + (bad > 1 ? 's ne correspondent' : ' ne correspond') + ' pas (nombre de définitions ≠ nombre de mots). Enregistrer quand même ?')) return
  if (cur && cur.blacks !== B && !confirm('Les cases noires ont changé : les lettres sur les cases devenues noires seront effacées. On y va ?')) return
  const body = {
    rows: R, cols: C, blacks: B,
    defsH: lire($('f-h').value, R), defsV: lire($('f-v').value, C),
    source: $('f-source').value.trim(), date: $('f-date').value, saint: $('f-saint').value.trim(),
    meteoSam: $('f-sam').value.trim(), meteoDim: $('f-dim').value.trim(), lune: $('f-lune').value.trim(), soleil: $('f-soleil').value.trim(),
    annonces: $('f-pa').value.split('\n').map(s => s.trim()).filter(Boolean)
  }
  const btn = $('ed-save'); btn.disabled = true; $('ed-etat').textContent = 'On imprime…'
  try {
    const m = cur ? await api('/' + cur.id, { method: 'PUT', body: JSON.stringify(body) }) : await api('', { method: 'POST', body: JSON.stringify(body) })
    cur = m; dirty = false
    $('ed-titre').textContent = 'Grille n° ' + m.numero
    $('ed-voir').href = '/g/' + m.id; $('ed-voir').classList.remove('hide')
    $('ed-etat').innerHTML = 'Enregistré. Lien à partager : <span class="lien">' + esc(lien(m.id)) + '</span>'
  } catch (e) { $('ed-etat').textContent = 'Pas enregistré : ' + e.message }
  btn.disabled = false
}

liste()
