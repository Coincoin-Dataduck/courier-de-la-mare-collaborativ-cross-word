// Logique partagée serveur / navigateur
export const INKS = ['#1e3f8a', '#a8241c', '#2b6a3a', '#6a3c9c', '#8a5208', '#0f6670', '#a3295f', '#3d3a35', '#5b6b1a', '#b0461b']

// blacks : chaîne de rows*cols caractères, '1' = case noire
export function isBlack(meta, r, c) { return meta.blacks[r * meta.cols + c] === '1' }

// Mots = suites d'au moins 2 cases blanches. La k-ième suite d'une ligne va avec la k-ième définition.
export function words(meta) {
  const out = { h: [], v: [] }
  const scan = (d, n, m, at) => {
    for (let i = 0; i < n; i++) {
      let k = 0, run = []
      const flush = () => { if (run.length >= 2) out[d].push({ id: d + '-' + i + '-' + k++, d, line: i, k: k - 1, cells: run }); run = [] }
      for (let j = 0; j < m; j++) { const [r, c] = at(i, j); if (isBlack(meta, r, c)) flush(); else run.push([r, c]) }
      flush()
    }
  }
  scan('h', meta.rows, meta.cols, (i, j) => [i, j])
  scan('v', meta.cols, meta.rows, (i, j) => [j, i])
  return out
}

// "9. Petit cours. Possessif ? Gros chat…" -> ["Petit cours.", "Possessif ?", "Gros chat…"]
export function splitDefs(line) {
  const s = String(line || '').replace(/^\s*\d+\s*[.)\-:]\s*/, '').trim()
  if (!s) return []
  return s.split(/(?<=[.!?…])\s+(?=\S)/).map(x => x.trim()).filter(Boolean).map(x => /[.!?…]$/.test(x) ? x : x + '.')
}

export function cleanMeta(m) {
  const rows = Math.max(3, Math.min(40, m.rows | 0)), cols = Math.max(3, Math.min(40, m.cols | 0))
  let blacks = String(m.blacks || '').replace(/[^01]/g, '').slice(0, rows * cols)
  blacks = blacks.padEnd(rows * cols, '0')
  const arr = (a, n) => Array.from({ length: n }, (_, i) => String((a || [])[i] || '').slice(0, 600))
  const txt = (v, n = 80) => String(v || '').slice(0, n)
  return {
    id: m.id, numero: m.numero | 0, created: m.created, rows, cols, blacks,
    defsH: arr(m.defsH, rows), defsV: arr(m.defsV, cols),
    source: txt(m.source), date: txt(m.date, 10),
    meteoSam: txt(m.meteoSam), meteoDim: txt(m.meteoDim), saint: txt(m.saint), lune: txt(m.lune), soleil: txt(m.soleil),
    annonces: (Array.isArray(m.annonces) ? m.annonces : []).map(a => txt(a, 300)).filter(Boolean).slice(0, 12)
  }
}
