// Lire une capture de journal : repérer la grille et ses cases noires (sans IA),
// et préparer l'image pour la lecture des définitions (IA de Cloudflare, côté serveur).

// Charge un fichier image dans un <img>
export function chargerImage(file) {
  return new Promise((ok, ko) => {
    const u = URL.createObjectURL(file), im = new Image()
    im.onload = () => { ok(im) }
    im.onerror = () => ko(new Error('Image illisible'))
    im.src = u
  })
}

// Dessine l'image (réduite si besoin) et renvoie le canvas
export function versCanvas(im, max) {
  const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight))
  const cv = document.createElement('canvas')
  cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k)
  const x = cv.getContext('2d', { willReadFrequently: true })
  x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(im, 0, 0, cv.width, cv.height)
  return cv
}

// Image allégée (JPEG) pour l'envoyer à la lecture des définitions
export function pourEnvoi(im) { return versCanvas(im, 1600).toDataURL('image/jpeg', 0.85) }

// Les traits de la grille : lignes (ou colonnes) où le noir court sans interruption sur une grande longueur.
// Une grille a des traits régulièrement espacés : on garde la plus longue suite à pas constant.
function traits(run, n) {
  // les traits d'une même grille ont tous à peu près la même longueur : on essaie chaque longueur présente
  const vals = [...new Set(Array.from(run).filter(v => v >= 40).map(v => Math.round(v / 4) * 4))].sort((a, b) => b - a).slice(0, 80)
  let best = null
  for (const v of vals) {
    const cl = []
    for (let i = 0; i < n; i++) {
      if (run[i] < v * 0.85 || run[i] > v * 1.3) continue
      const d = cl[cl.length - 1]
      if (d && i - d.b <= 1) d.b = i; else cl.push({ a: i, b: i })
    }
    const c = cl.map(x => (x.a + x.b) / 2)
    for (let s = 0; s < c.length - 1; s++) {
      const pas = c[s + 1] - c[s]; if (pas < 6) continue
      let e = s + 1
      while (e + 1 < c.length && Math.abs(c[e + 1] - c[e] - pas) <= Math.max(2, pas * 0.2)) e++
      if (e - s >= 3 && (!best || e - s > best.c.length - 1)) best = { c: c.slice(s, e + 1) }
    }
  }
  return best ? best.c : null
}

// Repère la grille dans un canvas. Renvoie { R, C, B, douteuses, nb } ou null.
export function lireGrille(cv) {
  const w = cv.width, h = cv.height, d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data
  const noir = new Uint8Array(w * h)
  for (let i = 0, j = 0; i < w * h; i++, j += 4) noir[i] = (d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114) < 150 ? 1 : 0
  const runR = new Int32Array(h), runC = new Int32Array(w)
  for (let y = 0; y < h; y++) { let r = 0, m = 0; for (let x = 0; x < w; x++) { r = noir[y * w + x] ? r + 1 : 0; if (r > m) m = r } runR[y] = m }
  for (let x = 0; x < w; x++) { let r = 0, m = 0; for (let y = 0; y < h; y++) { r = noir[y * w + x] ? r + 1 : 0; if (r > m) m = r } runC[x] = m }
  const ys = traits(runR, h), xs = traits(runC, w)
  if (!ys || !xs) return null
  const R = ys.length - 1, C = xs.length - 1
  if (R < 3 || C < 3 || R > 40 || C > 40) return null
  let B = '', douteuses = [], nb = 0
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const x0 = xs[c], x1 = xs[c + 1], y0 = ys[r], y1 = ys[r + 1]
    const mx = (x1 - x0) * 0.22, my = (y1 - y0) * 0.22
    let n = 0, t = 0
    for (let y = Math.round(y0 + my); y <= Math.round(y1 - my); y++) for (let x = Math.round(x0 + mx); x <= Math.round(x1 - mx); x++) { t++; n += noir[y * w + x] }
    const f = t ? n / t : 0
    const est = f > 0.7
    B += est ? '1' : '0'; if (est) nb++
    if (f > 0.45 && f < 0.88) douteuses.push([r, c])
  }
  return { R, C, B, douteuses, nb, xs, ys, box: { x0: xs[0], x1: xs[C], y0: ys[0], y1: ys[R] } }
}

// Range les définitions lues ({ h:[{n,t}], v:[{n,t}] }) dans les mots de la grille, par numéro.
// Renvoie { clues, n, perdues: ['H 61', ...] }
export function ranger(W, lu) {
  const clues = {}, perdues = []; let n = 0
  for (const d of ['h', 'v']) for (const x of (lu && lu[d]) || []) {
    const w = W[d].find(w => w.n === +x.n)
    if (w && x.t) { clues[w.id] = x.t; n++ } else perdues.push(d.toUpperCase() + ' ' + x.n)
  }
  return { clues, n, perdues }
}

// Image de la grille seule (agrandie) pour la lecture des lettres de la solution
export function recadrer(cv, box) {
  const m = 4, x0 = Math.max(0, Math.floor(box.x0 - m)), y0 = Math.max(0, Math.floor(box.y0 - m))
  const w = Math.min(cv.width, Math.ceil(box.x1 + m)) - x0, h = Math.min(cv.height, Math.ceil(box.y1 + m)) - y0
  const k = Math.min(1600 / Math.max(w, h), Math.max(1, 1000 / w))
  const o = document.createElement('canvas'); o.width = Math.round(w * k); o.height = Math.round(h * k)
  const x = o.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cv, x0, y0, w, h, 0, 0, o.width, o.height)
  return o.toDataURL('image/jpeg', 0.92)
}

// Où se place la grille de la capture dans celle de l'éditeur (capture coupée = moins de lignes)
// Renvoie { dr, dc, score } (score = part des cases noires/blanches identiques) ou null
export function caler(g, R, C, B) {
  if (g.R > R || g.C > C) return null
  let best = null
  for (let dr = 0; dr <= R - g.R; dr++) for (let dc = 0; dc <= C - g.C; dc++) {
    let ok = 0
    for (let r = 0; r < g.R; r++) for (let c = 0; c < g.C; c++) if (g.B[r * g.C + c] === B[(r + dr) * C + c + dc]) ok++
    const score = ok / (g.R * g.C)
    if (!best || score > best.score) best = { dr, dc, score }
  }
  return best
}

// Les mots de la grille lue (2 lettres et plus), dans un sens : listes de cases [r, c]
export function motsDe(g, d) {
  const L = [], A = d === 'h' ? g.R : g.C, N = d === 'h' ? g.C : g.R
  for (let a = 0; a < A; a++) {
    let run = []
    for (let b = 0; b <= N; b++) {
      const r = d === 'h' ? a : b, c = d === 'h' ? b : a
      if (b < N && g.B[r * g.C + c] === '0') run.push([r, c])
      else { if (run.length >= 2) L.push(run); run = [] }
    }
  }
  return L
}

// Planche : chaque mot sur une ligne numérotée, cases recopiées côte à côte, sans traits ni cases noires
export function planche(cv, g, mots) {
  const T = 56, G = 5, LAB = 90, larg = Math.max(...mots.map(m => m.length))
  const o = document.createElement('canvas'); o.width = LAB + larg * (T + G) + 20; o.height = mots.length * (T + 22) + 22
  const x = o.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, o.width, o.height); x.imageSmoothingQuality = 'high'
  x.font = 'bold 30px Arial, sans-serif'; x.textBaseline = 'middle'
  mots.forEach((m, i) => {
    const y = 22 + i * (T + 22)
    x.fillStyle = '#777'; x.fillText((i + 1) + ' :', 10, y + T / 2)
    m.forEach(([r, c], k) => {
      const x0 = g.xs[c], x1 = g.xs[c + 1], y0 = g.ys[r], y1 = g.ys[r + 1], mx = (x1 - x0) * 0.17, my = (y1 - y0) * 0.17
      x.drawImage(cv, x0 + mx, y0 + my, x1 - x0 - 2 * mx, y1 - y0 - 2 * my, LAB + k * (T + G), y, T, T)
    })
  })
  return o.toDataURL('image/jpeg', 0.92)
}

// ---------- Définitions groupées par ligne et par colonne (Le Monde, Michel Laclos…) ----------
// « III. Bain-douche. Roulé par Carmen. Morceaux pour baryton. » = les trois mots de la ligne III, de gauche à droite.

const ROM = { I: 1, V: 5, X: 10, L: 50, C: 100 }
export function romain(s) {
  s = String(s).toUpperCase(); if (!/^[IVXLC]+$/.test(s)) return 0
  let n = 0; for (let i = 0; i < s.length; i++) { const a = ROM[s[i]], b = ROM[s[i + 1]] || 0; n += a < b ? -a : a }
  return n
}
export const versRomain = n => [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']].reduce((s, [v, l]) => { while (n >= v) { s += l; n -= v } return s }, '')

// Coupe le texte d'une ligne en définitions : après . ? ! … suivi d'une majuscule, d'un chiffre ou d'un guillemet.
// On ne coupe pas après une initiale ou une abréviation (« M. Dupont », « J.-C. », « St. »).
const ABREV = /(?:^|[\s(«"'’-])(?:\p{Lu}|M|MM|Mme|Mlle|Mgr|Dr|St|Ste|cf|etc|av|apr|env|ex)\.$/u
export function decouper(t, attendu) {
  const prudent = couper(t, true)
  if (!attendu || prudent.length === attendu) return prudent
  const tout = couper(t, false) // on coupe aussi après les abréviations si ça tombe juste
  return tout.length === attendu ? tout : prudent
}
function couper(t, prudent) {
  const out = []; let cur = '', i = 0, m
  const re = /([.?!…]+)(\s+)(?=[\p{Lu}0-9«"(])/gu
  while ((m = re.exec(t))) {
    cur += t.slice(i, m.index + m[1].length); i = m.index + m[0].length
    if (prudent && m[1] === '.' && ABREV.test(cur)) { cur += m[2]; continue }
    out.push(cur.trim()); cur = ''
  }
  cur += t.slice(i); if (cur.trim()) out.push(cur.trim())
  return out.filter(Boolean)
}

// Range { h:[{n,t}], v:[{n,t}] } où n = numéro de ligne (h) ou de colonne (v) et t = toutes ses définitions.
// Renvoie { clues, n, perdues, ecarts: ['Ligne III : 4 définitions pour 3 mots', …] }
export function rangerLignes(W, lu) {
  const clues = {}, perdues = [], ecarts = []; let n = 0
  for (const d of ['h', 'v']) for (const x of (lu && lu[d]) || []) {
    const k = +x.n - 1, nom = d === 'h' ? 'ligne ' + versRomain(+x.n) : 'colonne ' + x.n
    const mots = W[d].filter(w => (d === 'h' ? w.cells[0][0] : w.cells[0][1]) === k)
    const defs = decouper(x.t || '', mots.length)
    if (!mots.length) { perdues.push(nom); continue }
    if (defs.length !== mots.length) ecarts.push(nom + ' : ' + defs.length + ' déf. pour ' + mots.length + ' mot' + (mots.length > 1 ? 's' : ''))
    mots.forEach((w, i) => {
      // trop de définitions : le reste va dans le dernier mot, pour ne rien perdre
      const t = i === mots.length - 1 ? defs.slice(i).join(' ') : defs[i]
      if (t) { clues[w.id] = t.slice(0, 300); n++ }
    })
  }
  return { clues, n, perdues, ecarts }
}

// Les définitions lues ressemblent-elles au format par ligne ?
// (l'IA le signale ; sinon : plusieurs définitions par numéro et pas plus de numéros que de lignes / colonnes)
export function parLignes(lu, R, C) {
  if (!lu) return false
  if (lu.format === 'ligne') return true
  if (lu.format === 'mot') return false
  const h = lu.h || [], v = lu.v || [], all = [...h, ...v]
  if (!all.length) return false
  const multi = all.filter(x => decouper(x.t).length > 1).length
  return h.every(x => x.n <= R) && v.every(x => x.n <= C) && multi >= all.length / 2
}

// Texte collé (Texte en direct de l'iPhone, copier-coller d'un PDF…) → { format, h, v }, sans IA.
// « Horizontalement. I. … - II. … Verticalement. 1. … - 2. … », numéros romains ou arabes.
export function lireTexte(txt) {
  let t = String(txt || '').replace(/\r/g, '')
    .replace(/(\p{L})-\n\s*(\p{Ll})/gu, '$1$2') // mots coupés en fin de ligne
    .replace(/\s+/g, ' ').trim()
  const iH = t.search(/horizontalement/i), iV = t.search(/verticalement/i)
  const part = (a, b) => a < 0 ? '' : t.slice(a, b > a ? b : undefined).replace(/^\S+\s*[.:]?\s*/, '')
  const out = { h: suite(part(iH, iV)), v: suite(part(iV, iH)) }
  const rom = /^\s*[IVXLC]+\s*\./.test(part(iH, iV))
  out.format = rom || [...out.h, ...out.v].some(x => decouper(x.t).length > 1) ? 'ligne' : 'mot'
  return out
}
// Découpe une section en numéros successifs : on cherche 1 (ou I), puis 2 (ou II)… dans l'ordre
function suite(s) {
  const L = []; if (!s) return L
  const rom = /^[IVXLC]+\s*\./.test(s)
  const tok = n => rom ? versRomain(n) : String(n)
  let pos = 0, n = 1, deb = null
  for (;;) {
    const re = new RegExp('(^|[\\s—–-])' + tok(n) + '\\s*\\.\\s', 'g'); re.lastIndex = pos
    const m = re.exec(s); if (!m) break
    if (deb) L.push({ n: n - 1, t: s.slice(deb, m.index).replace(/\s*[—–-]\s*$/, '').trim() })
    deb = m.index + m[0].length; pos = deb; n++
  }
  if (deb) L.push({ n: n - 1, t: s.slice(deb).replace(/\s*[—–-]\s*$/, '').trim() })
  return L.filter(x => x.t)
}
