// Le Courrier de la Mare — le kiosque : toutes les grilles, en cours et anciennes
const $ = id => document.getElementById(id)
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
let all = [], filtre = 'toutes'

function lune(d) {
  const age = (((d - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % 29.530588853 + 29.530588853) % 29.530588853
  return age < 1.85 ? 'nouvelle' : age < 6.5 ? 'croissante' : age < 8.3 ? 'premier quartier' : age < 13.9 ? 'gibbeuse' : age < 15.7 ? 'pleine' : age < 21.2 ? 'gibbeuse' : age < 23 ? 'dernier quartier' : age < 27.7 ? 'décroissante' : 'nouvelle'
}
const parution = g => new Date(g.date ? g.date + 'T12:00:00' : (g.created || Date.now())).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
function quand(ts) {
  if (!ts) return '—'
  const d = new Date(ts), now = new Date(), h = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ')
  const j = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5)
  if (j === 0) return 'aujourd’hui à ' + h
  if (j === 1) return 'hier à ' + h
  return 'le ' + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}
// vignette : cases noires, cases écrites en gris
function mini(g) {
  const s = 10, W = g.cols * s, H = g.rows * s
  let r = ''
  for (let i = 0; i < g.rows * g.cols; i++) {
    const x = (i % g.cols) * s, y = Math.floor(i / g.cols) * s
    if ((g.blacks || '')[i] === '1') r += '<rect x="' + x + '" y="' + y + '" width="' + s + '" height="' + s + '" fill="#24211d"/>'
    else if ((g.filled || '')[i] === '1') r += '<rect x="' + (x + 2) + '" y="' + (y + 2) + '" width="' + (s - 4) + '" height="' + (s - 4) + '" fill="#8d867a"/>'
  }
  let l = ''
  for (let i = 1; i < g.cols; i++) l += 'M' + i * s + ' 0V' + H
  for (let i = 1; i < g.rows; i++) l += 'M0 ' + i * s + 'H' + W
  return '<svg viewBox="-1 -1 ' + (W + 2) + ' ' + (H + 2) + '" aria-hidden="true"><rect width="' + W + '" height="' + H + '" fill="#f7f3ea"/>' + r + '<path d="' + l + '" stroke="#24211d" stroke-width=".4" fill="none"/><rect width="' + W + '" height="' + H + '" stroke="#24211d" stroke-width="1.4" fill="none"/></svg>'
}
function carte(g) {
  const rot = ((g.numero * 37) % 7 - 3) * 0.6
  const stp = g.fin === 'double' ? '<div class="stp d">Double tamponné</div>' : g.fin === 'simple' ? '<div class="stp">Tamponné</div>' : ''
  const etat = g.fin === 'double' ? 'Tous les mots trouvés' : g.fin === 'simple' ? 'Abandonnée à ' + g.pct + ' %' : g.pct + ' % rempli'
  const best = g.best ? 'Le plus fort : <span class="dot" style="background:' + esc(g.best.color) + '"></span><b style="color:' + esc(g.best.color) + '">' + esc(g.best.name) + '</b> (' + g.best.n + ' mot' + (g.best.n > 1 ? 's' : '') + ')' : 'Personne n’a encore trouvé de mot.'
  return '<a class="mu' + (g.fin ? '' : ' cours') + '" href="/g/' + g.id + '" style="--r:' + rot + 'deg">' +
    '<div class="mt"><span>N° ' + g.numero + '</span><span>' + parution(g) + '</span></div>' +
    '<div class="mm">Le Courrier<br>de la Mare</div>' +
    '<div class="mb"><span>' + esc(g.source || 'Mots croisés') + '</span><span>' + g.rows + ' × ' + g.cols + '</span></div>' +
    '<div class="vig">' + mini(g) + '</div>' + stp +
    '<div class="bas"><span class="pct">' + etat + '</span>' + (g.fin ? '' : '<div class="bar"><i style="width:' + g.pct + '%"></i></div>') +
    g.players + ' joueur' + (g.players > 1 ? 's' : '') + '. ' + best + '<br>Dernière lettre : ' + quand(g.last) + '</div></a>'
}
function rendu() {
  const gs = all.filter(g => filtre === 'toutes' || (filtre === 'cours' && !g.fin) || (filtre === 'tamp' && g.fin) || ('s:' + (g.source || '')) === filtre)
  $('pres').innerHTML = gs.map(carte).join('')
  $('kq-vide').textContent = all.length ? (gs.length ? '' : 'Rien de ce côté-là du présentoir.') : 'Le kiosque est vide pour l’instant. Le canard attend la prochaine grille.'
}
function filtres() {
  const src = [...new Set(all.map(g => g.source).filter(Boolean))]
  const f = [['toutes', 'Toutes'], ['cours', 'En cours'], ['tamp', 'Tamponnées'], ...(src.length > 1 ? src.map(s => ['s:' + s, s]) : [])]
  $('flt').innerHTML = f.map(([k, t]) => '<button data-f="' + esc(k) + '" class="' + (k === filtre ? 'on' : '') + '">' + esc(t) + '</button>').join('')
}
$('flt').onclick = e => { const b = e.target.closest('button'); if (!b) return; filtre = b.dataset.f; filtres(); rendu() }

// On prend le journal : il se soulève, puis se déplie jusqu’à la page
$('pres').onclick = e => {
  const a = e.target.closest('a.mu')
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return
  if (matchMedia('(prefers-reduced-motion:reduce)').matches) return
  e.preventDefault()
  a.classList.add('pris')
  setTimeout(() => {
    const b = a.getBoundingClientRect(), v = document.createElement('div')
    v.className = 'envol'; v.innerHTML = a.innerHTML
    Object.assign(v.style, { left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px', transform: 'rotate(' + getComputedStyle(a).getPropertyValue('--r') + ')' })
    document.body.appendChild(v)
    v.getBoundingClientRect()
    v.style.transition = 'left .45s cubic-bezier(.5,0,.2,1),top .45s cubic-bezier(.5,0,.2,1),width .45s cubic-bezier(.5,0,.2,1),height .45s cubic-bezier(.5,0,.2,1),transform .45s'
    v.classList.add('go')
    Object.assign(v.style, { left: '0px', top: '0px', width: innerWidth + 'px', height: innerHeight + 'px', transform: 'rotate(0deg)' })
    setTimeout(() => { location.href = a.href }, 470)
  }, 230)
}
// retour arrière : on remet le présentoir en ordre
addEventListener('pageshow', () => { document.querySelectorAll('.envol').forEach(x => x.remove()); document.querySelectorAll('.pris').forEach(x => x.classList.remove('pris')) })

async function start() {
  const d = new Date()
  const ds = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  $('m-date').textContent = ds.charAt(0).toUpperCase() + ds.slice(1)
  $('m-lune').textContent = lune(d)
  try { all = await (await fetch('/api/kiosque')).json() } catch { $('kq-vide').textContent = 'Pas de réseau…'; setTimeout(start, 3000); return }
  const n = all.length, c = all.filter(g => !g.fin).length
  $('k-cours').textContent = c; $('k-tamp').textContent = n - c
  $('m-band').textContent = n + ' grille' + (n > 1 ? 's' : '')
  filtres(); rendu()
}
start()
