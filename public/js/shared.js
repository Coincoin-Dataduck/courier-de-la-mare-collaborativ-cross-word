// Logique partagée serveur / navigateur
export const INKS = ['#1e3f8a', '#a8241c', '#2b6a3a', '#6a3c9c', '#8a5208', '#0f6670', '#a3295f', '#3d3a35', '#5b6b1a', '#b0461b', '#a07c00']

// blacks : chaîne de rows*cols caractères, '1' = case noire
export function isBlack(meta, r, c) { return meta.blacks[r * meta.cols + c] === '1' }

// Numérotation classique : chaque case qui commence un mot (2 lettres ou plus) reçoit un numéro,
// de gauche à droite puis de haut en bas. Un même numéro peut servir à un horizontal et à un vertical.
// L'identifiant d'un mot dépend de sa case de départ : "h-3-0" = horizontal qui part de la ligne 4, colonne 1.
export function words(meta) {
  const R = meta.rows, C = meta.cols, out = { h: [], v: [], nums: {}, byId: {} }
  const b = (r, c) => r < 0 || c < 0 || r >= R || c >= C || isBlack(meta, r, c)
  let n = 0
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    if (b(r, c)) continue
    const sh = b(r, c - 1) && !b(r, c + 1), sv = b(r - 1, c) && !b(r + 1, c)
    if (!sh && !sv) continue
    n++; out.nums[r + ',' + c] = n
    if (sh) { const cells = []; for (let j = c; !b(r, j); j++) cells.push([r, j]); out.h.push({ id: 'h-' + r + '-' + c, d: 'h', n, cells }) }
    if (sv) { const cells = []; for (let i = r; !b(i, c); i++) cells.push([i, c]); out.v.push({ id: 'v-' + r + '-' + c, d: 'v', n, cells }) }
  }
  for (const w of [...out.h, ...out.v]) out.byId[w.id] = w
  return out
}

// Case symétrique (rotation d'un demi-tour, comme dans les grilles des journaux)
export const mirror = (meta, r, c) => [meta.rows - 1 - r, meta.cols - 1 - c]

export function cleanMeta(m) {
  const rows = Math.max(3, Math.min(40, m.rows | 0)), cols = Math.max(3, Math.min(40, m.cols | 0))
  let blacks = String(m.blacks || '').replace(/[^01]/g, '').slice(0, rows * cols)
  blacks = blacks.padEnd(rows * cols, '0')
  const txt = (v, n = 80) => String(v || '').slice(0, n)
  const clues = {}
  for (const [k, v] of Object.entries(m.clues && typeof m.clues === 'object' ? m.clues : {})) {
    const t = txt(v, 300).trim()
    if (/^[hv]-\d{1,2}-\d{1,2}$/.test(k) && t) clues[k] = t
  }
  return {
    v: 2, id: m.id, numero: m.numero | 0, created: m.created, rows, cols, blacks, clues,
    source: txt(m.source), date: txt(m.date, 10),
    meteoSam: txt(m.meteoSam), meteoDim: txt(m.meteoDim), saint: txt(m.saint), lune: txt(m.lune), soleil: txt(m.soleil),
    annonces: (Array.isArray(m.annonces) ? m.annonces : []).map(a => txt(a, 300)).filter(Boolean).slice(0, 12)
  }
}
