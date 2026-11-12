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
export function pourEnvoi(im) { return versCanvas(im, 2048).toDataURL('image/jpeg', 0.85) }

// ---------- Repérer la grille (lecture 4) ----------
// Principe : on ne cherche plus les traits, on cherche les CASES BLANCHES.
// 1. L'image est binarisée (noir = plus sombre que le papier autour), à une taille de travail fixe.
// 2. Chaque tache blanche fermée est une case possible. Les cases d'une grille ont toutes à peu près
//    la même aire, et chacune a ses voisines à un pas régulier dans deux directions.
// 3. On parcourt ce quadrillage de proche en proche (il peut se courber : chaque case prend ses propres
//    directions sur ses voisines). Chaque case reçoit son numéro de ligne et de colonne.
//    Le texte autour (lettres, chiffres, titre) ne forme pas de quadrillage : il reste dehors.
// 4. Les coins de chaque case donnent les croisements des traits ; ceux cachés par des cases noires sont
//    complétés par leurs voisins. Une case est noire si son cœur est bien plus sombre que ses voisines.
// Tout est mesuré en « tailles de case » : une petite image ou une grande donnent le même calcul.
// Si la taille est imposée (définitions Laclos, saisie) et diffère, ou si les coins sont posés à la main,
// le maillage est tendu entre les coins et s'accroche aux croisements trouvés.
export const LECTURE = 4
const TRAVAIL = 1400 // côté max de l'image analysée

export function lireGrille(cv, opts) {
  return analyser(cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height), opts)
}

// img = { width, height, data } (ImageData). opts = { R, C, coins: [hg, hd, bg, bd] en pixels de img }
export function analyser(img, opts = {}) {
  const W0 = img.width, H0 = img.height
  const s = Math.min(1, TRAVAIL / Math.max(W0, H0)), w = Math.max(1, Math.round(W0 * s)), h = Math.max(1, Math.round(H0 * s))
  const diag = { lecture: LECTURE, image: W0 + '×' + H0, travail: w + '×' + h }
  const lum = reduire(luminance(img), W0, H0, w, h)
  // noir : nettement plus sombre que la moyenne autour (ombre de la page), ou franchement noir
  const moy = moyenneLocale(lum, w, h, Math.max(6, Math.round(Math.max(w, h) / 40)))
  const papier = quantile(lum, 0.9)
  const noir = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) noir[i] = lum[i] < moy[i] * 0.85 || lum[i] < papier * 0.35 ? 1 : 0
  // traits fins et pâles (petite image, trait d'un pixel adouci) : un pixel nettement plus sombre que ses
  // voisins des deux côtés, à 2 ou 3 pixels, est sur un trait (mesuré sur l'image adoucie, pour le grain)
  const dx = adoucir(lum, w, h)
  for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) {
    const i = y * w + x, v = dx[i]
    for (const k of [2, 3]) {
      if (v < 0.93 * Math.min(dx[i - k * w], dx[i + k * w]) || v < 0.93 * Math.min(dx[i - k], dx[i + k])) { noir[i] = 1; break }
    }
  }
  if (opts.debug) Object.assign(opts.debug, { noir, w, h })

  // --- le quadrillage des cases blanches ---
  const q = quadrillage(noir, w, h)
  if (q) { diag.cases = q.n; diag.trouve = q.R + '×' + q.C; if (q.conflits) diag.conflits = q.conflits }
  let R, C, N // N[k][l] = croisement du trait horizontal k et du trait vertical l, en pixels de travail
  if (opts.coins || (opts.R && opts.C && q && (opts.R !== q.R || opts.C !== q.C))) {
    R = opts.R || (q && q.R); C = opts.C || (q && q.C)
    if (!R || !C) { diag.echec = 'taille inconnue : indique le nombre de lignes et de colonnes'; return { echec: diag.echec, diag } }
    const coins = opts.coins ? opts.coins.map(([x, y]) => [x * s, y * s]) : [q.N[0][0], q.N[0][q.C], q.N[q.R][0], q.N[q.R][q.C]]
    if (q && opts.R && opts.C && !opts.coins && (opts.R !== q.R || opts.C !== q.C)) diag.ecart = 'la photo ressemble plutôt à ' + q.R + ' × ' + q.C
    const T = tendre(coins, R, C, q)
    N = ajuster(T, noir, w, h, T.fige)
    diag.taille = opts.R ? 'donnée' : 'trouvée'; diag.coins = opts.coins ? 'à la main' : 'trouvés'
  } else if (q) {
    R = q.R; C = q.C; N = q.N
    diag.taille = opts.R ? 'donnée, confirmée' : 'trouvée'; diag.coins = 'trouvés'
  } else { diag.echec = 'pas de grille trouvée'; return { echec: diag.echec, diag } }
  if (R < 3 || C < 3 || R > 40 || C > 40) { diag.echec = 'taille improbable (' + R + ' × ' + C + ')'; return { echec: diag.echec, diag } }

  // --- cases noires : luminosité du cœur de chaque case, comparée aux cases voisines ---
  const m = []
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) m.push(coeur(lum, w, h, N[r][c], N[r][c + 1], N[r + 1][c], N[r + 1][c + 1]))
  const blancG = quantile(Float32Array.from(m), 0.8)
  let B = '', nb = 0
  const douteuses = []
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const v = []
    for (let i = Math.max(0, r - 2); i <= Math.min(R - 1, r + 2); i++) for (let j = Math.max(0, c - 2); j <= Math.min(C - 1, c + 2); j++) v.push(m[i * C + j])
    v.sort((a, b) => b - a)
    const blanc = Math.max(v[Math.floor(v.length * 0.25)] || 255, blancG * 0.6), f = m[r * C + c] / blanc
    const est = f < 0.55
    B += est ? '1' : '0'; if (est) nb++
    if (f > 0.4 && f < 0.7) douteuses.push([r, c])
  }

  // --- retour en coordonnées de l'image d'origine ---
  const maille = N.map(row => row.map(([x, y]) => [x / s, y / s]))
  const cell = (r, c) => {
    const a = maille[r][c], b = maille[r][c + 1], d = maille[r + 1][c], e = maille[r + 1][c + 1]
    return { x0: (a[0] + d[0]) / 2, x1: (b[0] + e[0]) / 2, y0: (a[1] + b[1]) / 2, y1: (d[1] + e[1]) / 2 }
  }
  const tous = maille.flat()
  const box = { x0: Math.min(...tous.map(p => p[0])), x1: Math.max(...tous.map(p => p[0])), y0: Math.min(...tous.map(p => p[1])), y1: Math.max(...tous.map(p => p[1])) }
  return { R, C, B, douteuses, nb, cell, box, maille, coins: [maille[0][0], maille[0][C], maille[R][0], maille[R][C]], diag }
}

// ---------- outils d'image ----------
function luminance(img) {
  const d = img.data, n = img.width * img.height, l = new Float32Array(n)
  for (let i = 0, j = 0; i < n; i++, j += 4) l[i] = d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114
  return l
}

// réduction par moyenne de zones (un trait fin reste visible, en gris, au lieu de disparaître)
function reduire(l, W, H, w, h) {
  if (w === W && h === H) return l
  const o = new Float32Array(w * h), fx = W / w, fy = H / h
  for (let y = 0; y < h; y++) {
    const ya = Math.floor(y * fy), yb = Math.max(ya + 1, Math.floor((y + 1) * fy))
    for (let x = 0; x < w; x++) {
      const xa = Math.floor(x * fx), xb = Math.max(xa + 1, Math.floor((x + 1) * fx))
      let t = 0
      for (let yy = ya; yy < yb; yy++) for (let xx = xa; xx < xb; xx++) t += l[yy * W + xx]
      o[y * w + x] = t / ((yb - ya) * (xb - xa))
    }
  }
  return o
}

function quantile(a, q) {
  const n = a.length, pas = Math.max(1, Math.floor(n / 20000)), v = []
  for (let i = 0; i < n; i += pas) v.push(a[i])
  v.sort((x, y) => x - y)
  return v[Math.min(v.length - 1, Math.floor(v.length * q))] || 0
}

// flou 3 × 3
function adoucir(l, w, h) {
  const o = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x
    o[i] = (l[i - w - 1] + l[i - w] + l[i - w + 1] + l[i - 1] + l[i] + l[i + 1] + l[i + w - 1] + l[i + w] + l[i + w + 1]) / 9
  }
  return o
}

// Moyenne de la luminosité dans un carré de côté 2k+1 autour de chaque pixel (image intégrale)
function moyenneLocale(lum, w, h, k) {
  const I = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) { let s = 0; for (let x = 0; x < w; x++) { s += lum[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + s } }
  const o = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const a = Math.max(0, y - k), b = Math.min(h, y + k + 1)
    for (let x = 0; x < w; x++) {
      const c = Math.max(0, x - k), e = Math.min(w, x + k + 1)
      o[y * w + x] = (I[b * (w + 1) + e] - I[a * (w + 1) + e] - I[b * (w + 1) + c] + I[a * (w + 1) + c]) / ((b - a) * (e - c))
    }
  }
  return o
}

// luminosité moyenne du cœur d'une case (quadrilatère a b / d e), échantillonnée entre 30 et 70 %
function coeur(lum, w, h, a, b, d, e) {
  let t = 0, n = 0
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const u = 0.3 + 0.1 * j, v = 0.3 + 0.1 * i
    const x = (1 - v) * ((1 - u) * a[0] + u * b[0]) + v * ((1 - u) * d[0] + u * e[0])
    const y = (1 - v) * ((1 - u) * a[1] + u * b[1]) + v * ((1 - u) * d[1] + u * e[1])
    const xi = Math.round(x), yi = Math.round(y)
    if (xi < 0 || yi < 0 || xi >= w || yi >= h) continue
    t += lum[yi * w + xi]; n++
  }
  return n ? t / n : 255
}

// ---------- le quadrillage ----------
// Renvoie { R, C, N (croisements), mes (croisements mesurés [k, l, p]), n, conflits } ou null
function quadrillage(noir0, w, h) {
  // on épaissit le noir d'un pixel : un trait fin un peu effacé ferme quand même sa case
  const noir = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!noir0[y * w + x]) continue
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx
      if (yy >= 0 && yy < h && xx >= 0 && xx < w) noir[yy * w + xx] = 1
    }
  }
  // taches blanches (4-connexité : une diagonale ne relie pas deux cases)
  const lab = new Int32Array(w * h), pile = new Int32Array(w * h), cand = []
  let id = 0
  for (let i0 = 0; i0 < w * h; i0++) {
    if (noir[i0] || lab[i0]) continue
    id++
    let n = 0, sp = 0, x0 = w, x1 = 0, y0 = h, y1 = 0, sx = 0, sy = 0, bord = false
    pile[sp++] = i0; lab[i0] = id
    while (sp) {
      const i = pile[--sp], x = i % w, y = (i - x) / w
      n++; sx += x; sy += y
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) bord = true
      if (x > 0 && !noir[i - 1] && !lab[i - 1]) { lab[i - 1] = id; pile[sp++] = i - 1 }
      if (x < w - 1 && !noir[i + 1] && !lab[i + 1]) { lab[i + 1] = id; pile[sp++] = i + 1 }
      if (y > 0 && !noir[i - w] && !lab[i - w]) { lab[i - w] = id; pile[sp++] = i - w }
      if (y < h - 1 && !noir[i + w] && !lab[i + w]) { lab[i + w] = id; pile[sp++] = i + w }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1
    // une case : fermée, pas minuscule, assez pleine (une lettre au milieu en prend une partie), à peu près carrée
    if (!bord && n >= 25 && n >= bw * bh * 0.35 && bw <= bh * 2.5 && bh <= bw * 2.5)
      cand.push({ id, n, cx: sx / n, cy: sy / n, x0, x1, y0, y1 })
  }
  if (cand.length < 9) return null
  // familles de taille : les cases d'une grille ont presque toutes la même aire. On essaie chaque famille
  // un peu fournie et on garde celle qui donne le plus grand quadrillage.
  const ln = cand.map(t => Math.log(t.n)), lo = Math.min(...ln), BIN = 0.2
  const hist = new Map(); for (const v of ln) { const b = Math.floor((v - lo) / BIN); hist.set(b, (hist.get(b) || 0) + 1) }
  const pics = [...hist.entries()].filter(([b, c]) => c >= 6 && c >= (hist.get(b - 1) || 0) && c >= (hist.get(b + 1) || 0)).map(([b]) => lo + (b + 0.5) * BIN)
  let best = null
  for (const pic of pics) {
    const g = parcourir(cand.filter(t => Math.abs(Math.log(t.n) - pic) < 0.7))
    if (g && (!best || g.n > best.n)) best = g
  }
  if (!best || best.n < 9) return null
  // numéros de ligne et de colonne à partir de 0
  const cs = best.cases
  const i0 = Math.min(...cs.map(t => t.i)), j0 = Math.min(...cs.map(t => t.j))
  const R = Math.max(...cs.map(t => t.i)) - i0 + 1, C = Math.max(...cs.map(t => t.j)) - j0 + 1
  if (R < 2 || C < 2 || R > 45 || C > 45) return null
  // croisements : chaque coin de case donne une mesure du croisement voisin ; on fait la moyenne
  const acc = Array.from({ length: R + 1 }, () => Array.from({ length: C + 1 }, () => [0, 0, 0]))
  const ajoute = (k, l, p) => { const a = acc[k][l]; a[0] += p[0]; a[1] += p[1]; a[2]++ }
  for (const t of cs) {
    // coins de la case : les points de la tache les plus loin dans les quatre directions diagonales
    // de SA grille locale (une case penchée par la courbure garde ses vrais coins)
    const u = norme(t.U), v = norme(t.V), dirs = [[-u[0] - v[0], -u[1] - v[1]], [u[0] - v[0], u[1] - v[1]], [-u[0] + v[0], -u[1] + v[1]], [u[0] + v[0], u[1] + v[1]]]
    const bestv = [-Infinity, -Infinity, -Infinity, -Infinity], bp = [null, null, null, null]
    for (let y = t.y0; y <= t.y1; y++) for (let x = t.x0; x <= t.x1; x++) {
      if (lab[y * w + x] !== t.id) continue
      for (let k = 0; k < 4; k++) { const p = x * dirs[k][0] + y * dirs[k][1]; if (p > bestv[k]) { bestv[k] = p; bp[k] = [x, y] } }
    }
    const r = t.i - i0, c = t.j - j0
    ajoute(r, c, bp[0]); ajoute(r, c + 1, bp[1]); ajoute(r + 1, c, bp[2]); ajoute(r + 1, c + 1, bp[3])
  }
  const N = acc.map(row => row.map(a => a[2] ? [a[0] / a[2], a[1] / a[2]] : null))
  const mes = []; N.forEach((row, k) => row.forEach((p, l) => { if (p) mes.push([k, l, p]) }))
  const fige = N.map(row => row.map(p => !!p))
  completer(N)
  return { R, C, N: ajuster(ajuster(N, noir0, w, h, fige), noir0, w, h, fige), mes, n: cs.length, conflits: best.conflits }
}

// Parcourt les taches de proche en proche et leur donne un numéro (i = ligne, j = colonne).
function parcourir(fam) {
  const n = fam.length
  if (n < 9) return null
  // seaux pour trouver vite les voisines
  const seaux = (pas) => {
    const m = new Map()
    for (const t of fam) { const k = Math.floor(t.cx / pas) + ',' + Math.floor(t.cy / pas); if (!m.has(k)) m.set(k, []); m.get(k).push(t) }
    return (t, r) => {
      const o = [], X = Math.floor(t.cx / pas), Y = Math.floor(t.cy / pas), k = Math.ceil(r)
      for (let a = -k; a <= k; a++) for (let b = -k; b <= k; b++) for (const u of m.get((X + a) + ',' + (Y + b)) || []) if (u !== t) o.push(u)
      return o
    }
  }
  // pas typique : distance médiane à la plus proche voisine
  const taille = Math.sqrt(fam.reduce((s, t) => s + t.n, 0) / n)
  const pres = seaux(taille)
  const dmin = fam.map(t => { let m = Infinity; for (const u of pres(t, 3)) m = Math.min(m, Math.hypot(u.cx - t.cx, u.cy - t.cy)); return m }).filter(isFinite).sort((a, b) => a - b)
  if (!dmin.length) return null
  const pas = dmin[dmin.length >> 1]
  const autour = seaux(pas)
  // directions de la grille : angles des vecteurs vers les voisines à un pas (modulo 90°)
  const hist = new Float32Array(90)
  for (const t of fam) for (const u of autour(t, 1.5)) {
    const d = Math.hypot(u.cx - t.cx, u.cy - t.cy); if (d < pas * 0.7 || d > pas * 1.4) continue
    let a = Math.atan2(u.cy - t.cy, u.cx - t.cx) * 180 / Math.PI; a = ((a % 90) + 90) % 90
    hist[Math.round(a) % 90]++
  }
  const lisse = a => hist[a] + 0.5 * (hist[(a + 1) % 90] + hist[(a + 89) % 90])
  let am = 0; for (let a = 1; a < 90; a++) if (lisse(a) > lisse(am)) am = a
  let ang = am * Math.PI / 180; if (ang > Math.PI / 4) ang -= Math.PI / 2 // la direction la plus proche de l'horizontale
  const U0 = [Math.cos(ang) * pas, Math.sin(ang) * pas], V0 = [-Math.sin(ang) * pas, Math.cos(ang) * pas]
  // départ : les taches qui ont le plus de voisines à un pas
  const voisines = t => autour(t, 1.5).filter(u => { const d = Math.hypot(u.cx - t.cx, u.cy - t.cy); return d > pas * 0.7 && d < pas * 1.3 }).length
  let best = null
  const essais = fam.map(t => [t, voisines(t)]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0])
  for (const dep of essais) {
    const vu = new Map(), pos = new Set()
    let conflits = 0
    vu.set(dep, { i: 0, j: 0, U: U0, V: V0 }); pos.add('0,0')
    // d'abord les voisines directes (un pas), puis par-dessus une case noire (deux pas, ou en diagonale)
    for (const portee of [1, 2]) {
    const file = [...vu.keys()]
    for (let f = 0; f < file.length; f++) {
      const t = file[f], e = vu.get(t)
      const det = e.U[0] * e.V[1] - e.U[1] * e.V[0]; if (Math.abs(det) < 1e-6) continue
      for (const u of autour(t, portee + 0.6)) {
        const dx = u.cx - t.cx, dy = u.cy - t.cy
        const a = (dx * e.V[1] - dy * e.V[0]) / det, b = (e.U[0] * dy - e.U[1] * dx) / det // d = a U + b V
        const ra = Math.round(a), rb = Math.round(b)
        if (Math.abs(a - ra) > 0.3 || Math.abs(b - rb) > 0.3 || (ra === 0 && rb === 0) || Math.abs(ra) + Math.abs(rb) > portee) continue
        const i = e.i + rb, j = e.j + ra, k = i + ',' + j
        if (vu.has(u)) { const g = vu.get(u); if (g.i !== i || g.j !== j) conflits++; continue }
        if (pos.has(k)) { conflits++; continue }
        // la voisine prend les directions mesurées sur ce pas (le quadrillage peut se courber)
        let U = e.U, V = e.V
        if (rb === 0 && Math.abs(ra) === 1) U = [dx * ra, dy * ra]
        if (ra === 0 && Math.abs(rb) === 1) V = [dx * rb, dy * rb]
        vu.set(u, { i, j, U, V }); pos.add(k); file.push(u)
      }
    }
    }
    if (!best || vu.size > best.n) best = { n: vu.size, conflits, cases: [...vu].map(([t, e]) => ({ ...t, i: e.i, j: e.j, U: e.U, V: e.V })) }
  }
  return best
}

const norme = p => { const l = Math.hypot(p[0], p[1]) || 1; return [p[0] / l, p[1] / l] }

// Complète les croisements manquants (cachés par des cases noires, ou cases non reconnues) :
// une forme douce (polynôme du 3e degré en ligne et colonne) ajustée sur les croisements mesurés,
// puis l'écart local des mesurés voisins est propagé (diffusion). Pas d'extrapolation qui s'emballe.
function completer(N) {
  const R = N.length - 1, C = N[0].length - 1
  const mes = []
  for (let k = 0; k <= R; k++) for (let l = 0; l <= C; l++) if (N[k][l]) mes.push([k, l, N[k][l]])
  const deg = mes.length >= 30 ? 3 : mes.length >= 12 ? 2 : 1
  const termes = (k, l) => { const a = 2 * k / R - 1, b = 2 * l / C - 1, t = []; for (let i = 0; i <= deg; i++) for (let j = 0; j <= deg - i; j++) t.push(a ** i * b ** j); return t }
  const cx = moindresCarres(mes.map(([k, l]) => termes(k, l)), mes.map(m => m[2][0])), cy = moindresCarres(mes.map(([k, l]) => termes(k, l)), mes.map(m => m[2][1]))
  const modele = (k, l) => { const t = termes(k, l); let x = 0, y = 0; for (let i = 0; i < t.length; i++) { x += cx[i] * t[i]; y += cy[i] * t[i] } return [x, y] }
  let D = N.map((row, k) => row.map((p, l) => { if (!p) return [0, 0]; const m = modele(k, l); return [p[0] - m[0], p[1] - m[1]] }))
  const connu = N.map(row => row.map(p => !!p))
  for (let it = 0; it < 80; it++) {
    const nv = D.map(r => r.map(v => v.slice()))
    for (let k = 0; k <= R; k++) for (let l = 0; l <= C; l++) {
      if (connu[k][l]) continue
      let sx = 0, sy = 0, n = 0
      for (const [dk, dl] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const a = k + dk, b = l + dl; if (a < 0 || a > R || b < 0 || b > C) continue; sx += D[a][b][0]; sy += D[a][b][1]; n++ }
      nv[k][l] = [sx / n * 0.97, sy / n * 0.97] // l'écart s'éteint doucement loin des mesures
    }
    D = nv
  }
  for (let k = 0; k <= R; k++) for (let l = 0; l <= C; l++) if (!N[k][l]) { const m = modele(k, l); N[k][l] = [m[0] + D[k][l][0], m[1] + D[k][l][1]] }
}
function moindresCarres(A, y) {
  const n = A[0].length, M = Array.from({ length: n }, () => new Float64Array(n + 1))
  for (let r = 0; r < A.length; r++) for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) M[i][j] += A[r][i] * A[r][j]; M[i][n] += A[r][i] * y[r] }
  for (let i = 0; i < n; i++) M[i][i] += 1e-6
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j] }
  }
  return Array.from({ length: n }, (_, i) => M[i][n] / M[i][i])
}

// Recale chaque croisement sur les traits de l'image : on cherche, à un quart de case près, le point
// où un petit trait horizontal et un petit trait vertical (dans les directions locales) sont le plus noirs.
// Dans une zone de cases noires tout est noir : on ne bouge pas.
function ajuster(N, noir, w, h, fige) {
  const R = N.length - 1, C = N[0].length - 1
  const at = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < w && y < h ? noir[y * w + x] : 0 }
  const g = (k, l) => N[Math.max(0, Math.min(R, k))][Math.max(0, Math.min(C, l))]
  const out = N.map(r => r.map(p => p.slice()))
  for (let k = 0; k <= R; k++) for (let l = 0; l <= C; l++) {
    if (fige && fige[k][l]) continue // mesuré sur les coins des cases blanches : déjà juste
    const p = N[k][l]
    const a = g(k, l - 1), b = g(k, l + 1), c = g(k - 1, l), d = g(k + 1, l)
    const u = [(b[0] - a[0]) / ((l < C) + (l > 0)), (b[1] - a[1]) / ((l < C) + (l > 0))], v = [(d[0] - c[0]) / ((k < R) + (k > 0)), (d[1] - c[1]) / ((k < R) + (k > 0))]
    const pas = (Math.hypot(...u) + Math.hypot(...v)) / 2; if (!(pas > 4)) continue
    const nb = Math.max(6, Math.min(24, Math.round(pas * 0.8))), fen = Math.max(1, Math.round(pas * 0.25))
    // les bras ne sortent pas de la grille (un chiffre ou un titre au-dessus ne doit pas attirer le coin)
    const u0 = l > 0 ? -0.4 : 0, u1 = l < C ? 0.4 : 0, v0 = k > 0 ? -0.4 : 0, v1 = k < R ? 0.4 : 0
    // un trait = du noir AVEC du blanc de part et d'autre : on compte le noir du bras moins celui des deux
    // bras parallèles décalés de 0,2 case. Au bord d'une case noire le vrai trait gagne encore (moitié blanc),
    // et au milieu d'une zone noire rien ne gagne : le croisement ne bouge pas.
    const bras = (x, y, d, o, t0, t1) => {
      let s = 0
      for (let i = 0; i <= nb; i++) {
        const t = t0 + (t1 - t0) * i / nb, X = x + d[0] * t, Y = y + d[1] * t
        s += at(X, Y) - 0.5 * (at(X + o[0] * 0.2, Y + o[1] * 0.2) + at(X - o[0] * 0.2, Y - o[1] * 0.2))
      }
      return s / (nb + 1)
    }
    const score = (x, y) => (bras(x, y, u, v, u0, u1) + bras(x, y, v, u, v0, v1)) / 2
    // recherche à pas de 2 pixels, puis affinée autour du meilleur
    let bs = -1, bx = p[0], by = p[1]
    const essai = (x, y) => {
      const sc = score(x, y)
      if (sc > bs + 1e-9 || (Math.abs(sc - bs) < 1e-9 && Math.hypot(x - p[0], y - p[1]) < Math.hypot(bx - p[0], by - p[1]))) { bs = sc; bx = x; by = y }
    }
    for (let dy = -fen; dy <= fen; dy += 2) for (let dx = -fen; dx <= fen; dx += 2) essai(p[0] + dx, p[1] + dy)
    const cx = bx, cy = by
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) essai(cx + dx, cy + dy)
    if (bs >= 0.3) out[k][l] = [bx, by]
  }
  return out
}

// Maillage R × C tendu entre quatre coins (posés à la main, ou taille imposée).
// S'il y a un quadrillage trouvé, on cherche quel décalage de numéros (lignes, colonnes) fait coïncider
// le plus de croisements avec lui (vote) ; tous les croisements du maillage qui tombent dans le quadrillage
// en prennent la position exacte. Les autres (rangées que le quadrillage n'a pas vues) suivent leurs voisins.
function tendre(coins, R, C, q) {
  const [a, b, c, d] = coins
  const base = (k, l) => { const u = l / C, v = k / R; return [(1 - v) * ((1 - u) * a[0] + u * b[0]) + v * ((1 - u) * c[0] + u * d[0]), (1 - v) * ((1 - u) * a[1] + u * b[1]) + v * ((1 - u) * c[1] + u * d[1])] }
  const pas = Math.max(2, (Math.hypot(b[0] - a[0], b[1] - a[1]) / C + Math.hypot(c[0] - a[0], c[1] - a[1]) / R) / 2)
  let D = Array.from({ length: R + 1 }, () => Array.from({ length: C + 1 }, () => [0, 0]))
  const fixe = Array.from({ length: R + 1 }, () => new Uint8Array(C + 1))
  if (q) {
    // vote : pour chaque croisement du maillage, le croisement mesuré le plus proche (moins d'un demi-pas)
    const votes = new Map()
    // (seulement près des coins : ailleurs, une page bombée écarte le maillage droit de plus d'une demi-case)
    for (let k = 0; k <= R; k++) for (let l = 0; l <= C; l++) {
      if (Math.min(k, R - k) > 2 || Math.min(l, C - l) > 2) continue
      const p0 = base(k, l); let m = null, dm = pas * 0.5
      for (const [kq, lq, p] of q.mes) { const dd = Math.hypot(p[0] - p0[0], p[1] - p0[1]); if (dd < dm) { dm = dd; m = [kq, lq] } }
      if (m) { const key = (m[0] - k) + ',' + (m[1] - l); votes.set(key, (votes.get(key) || 0) + 1) }
    }
    const top = [...votes].sort((x, y) => y[1] - x[1])[0]
    if (top && top[1] >= 3) {
      const [dk, dl] = top[0].split(',').map(Number)
      for (let k = 0; k <= R; k++) for (let l = 0; l <= C; l++) {
        const kq = k + dk, lq = l + dl
        if (kq < 0 || kq > q.R || lq < 0 || lq > q.C) continue
        const p0 = base(k, l), p = q.N[kq][lq]
        D[k][l] = [p[0] - p0[0], p[1] - p0[1]]; fixe[k][l] = 1
      }
    }
  }
  // les croisements sans correspondance suivent la moyenne de leurs voisins
  for (let it = 0; it < 120; it++) {
    const nv = D.map(r => r.map(v => v.slice()))
    for (let k = 0; k <= R; k++) for (let l = 0; l <= C; l++) {
      if (fixe[k][l]) continue
      let sx = 0, sy = 0, n = 0
      for (const [dk, dl] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const kk = k + dk, ll = l + dl; if (kk < 0 || kk > R || ll < 0 || ll > C) continue; sx += D[kk][ll][0]; sy += D[kk][ll][1]; n++ }
      nv[k][l] = [sx / n, sy / n]
    }
    D = nv
  }
  const N = D.map((row, k) => row.map((v, l) => { const p = base(k, l); return [p[0] + v[0], p[1] + v[1]] }))
  N.fige = fixe
  return N
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
      const { x0, x1, y0, y1 } = g.cell(r, c), mx = (x1 - x0) * 0.17, my = (y1 - y0) * 0.17
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
// L'IA met parfois plusieurs numéros dans une seule entrée (tout le texte sous « 1 »). On recompose le texte
// et on le redécoupe comme un texte collé ; on garde ce redécoupage s'il trouve nettement plus de numéros.
export function reparer(d) {
  if (!d) return d
  const h = d.h || [], v = d.v || [], avant = h.length + v.length
  if (!avant) return d
  const rom = d.format === 'ligne' || h.some(x => /(^|[\s—–-])[IVX]{2,}\s*\.\s/.test(x.t))
  const sec = (L, r) => L.map(x => (r ? versRomain(+x.n) : x.n) + '. ' + x.t).join(' - ')
  const txt = 'Horizontalement. ' + sec(h, rom) + (v.length ? ' Verticalement. ' + sec(v, false) : '')
  const r = lireTexte(txt), apres = r.h.length + r.v.length
  if (apres < avant + 2) return d
  return { ...d, h: r.h, v: r.v, format: d.format || r.format, repare: avant + ' → ' + apres }
}
// Découpe une section en numéros successifs : on cherche 1 (ou I), puis 2 (ou II)… dans l'ordre.
// Tolère les erreurs de lecture des chiffres (Texte en direct : « 11 » lu « Il », « 13 » lu « B », « III » lu « IIl »)
// et un numéro illisible : on cherche alors le suivant, et le texte du numéro perdu reste avec le précédent.
const OCR_ROM = { I: '[Il1|!í]', V: '[VvY]', X: '[Xx×]', L: '[L]', C: '[Cc]' }
const OCR_NUM = { 0: '[0Oo]', 1: '[1lIi|!]', 2: '[2Z]', 3: '[3B]', 5: '[5S]', 6: '[6b]', 8: '[8B]', 9: '[9g]' }
const nettoie = t => t.replace(/\s*[—–-]\s*$/, '').trim()
function suite(s) {
  const L = []; if (!s) return L
  const rom = /(^|[\s—–-])(II|III|IV|VI|IX|XI|XV)\s*[.,]/.test(s) && !/^\s*[0-9]/.test(s)
  const motif = n => {
    const m = (rom ? versRomain(n) : String(n)).split('').map(ch => (rom ? OCR_ROM : OCR_NUM)[ch] || ch)
    if (!rom && n >= 10 && n < 20) m[0] += '?' // le « 1 » ancien, très fin, disparaît parfois (« 13 » lu « B »)
    return m.join('')
  }
  const chercher = (n, pos) => {
    // numéro suivi d'un point ; ou, après un tiret, numéro dont le point a été perdu
    const re = new RegExp('(?:(^|[\\s—–-])' + motif(n) + '\\s*[.,]\\s|[—–-]\\s*' + motif(n) + '\\s+(?=[\\p{Lu}«"]))', 'gu')
    re.lastIndex = pos; return re.exec(s)
  }
  let pos = 0, n = 1, deb = null
  for (;;) {
    let m = null, k = n
    for (; k < n + 3 && !m; k++) m = chercher(k, pos) // numéro illisible : on essaie les deux suivants
    if (!m) break
    k--
    if (deb !== null) {
      let t = s.slice(deb, m.index + (m[1] || '').length)
      // un numéro sauté : on le cherche au dernier « - xx. » du morceau (numéro illisible)
      const perdu = k === n + 1 && [...t.matchAll(/\s[—–-]\s*\S{1,5}?[.,]?\s+(?=[\p{Lu}«"])/gu)].pop()
      if (perdu) { L.push({ n: n - 1, t: nettoie(t.slice(0, perdu.index)) }); L.push({ n, t: nettoie(t.slice(perdu.index + perdu[0].length)) }) }
      else L.push({ n: n - 1, t: nettoie(t) })
    }
    deb = m.index + m[0].length; pos = deb; n = k + 1
  }
  if (deb !== null) L.push({ n: n - 1, t: nettoie(s.slice(deb)) })
  return L.filter(x => x.t)
}
