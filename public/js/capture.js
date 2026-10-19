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
  return { R, C, B, douteuses, nb }
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
