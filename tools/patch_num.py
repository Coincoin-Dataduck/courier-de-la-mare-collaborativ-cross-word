import re
P = '/data/courrier/'
def sub(s, a, b):
    assert a in s, a[:70]
    return s.replace(a, b, 1)

# ---------- grille.js ----------
p = P + 'public/js/grille.js'; s = open(p).read()
s = sub(s, "import { words, splitDefs, isBlack, INKS } from './shared.js'", "import { words, isBlack, INKS } from './shared.js'")
s = sub(s, "let meta, W, byCell = {}, defs = { h: [], v: [] }", "let meta, W, byCell = {}")
s = sub(s, "  defs.h = meta.defsH.map(splitDefs); defs.v = meta.defsV.map(splitDefs)\n", "  meta.clues = meta.clues || {}\n")
s = sub(s, """  g.style.gridTemplateColumns = 'var(--lab) repeat(' + C + ',var(--cs))'
  let h = '<div></div>'
  for (let c = 0; c < C; c++) h += '<div class="lab col" data-lc="' + c + '">' + (c + 1) + '</div>'
  for (let r = 0; r < R; r++) {
    h += '<div class="lab row" data-lr="' + r + '">' + (r + 1) + '</div>'
""", """  g.style.gridTemplateColumns = 'repeat(' + C + ',var(--cs))'
  let h = ''
  for (let r = 0; r < R; r++) {
""")
s = sub(s, """  if (isBlack(meta, r, c)) return
  if (v) {""", """  if (isBlack(meta, r, c)) return
  const nb = W.nums[k] ? '<b class="num">' + W.nums[k] + '</b>' : ''
  if (v) {""")
s = sub(s, """    e.innerHTML = '<i' + (anim ? ' class="st"' : '') + ' title="' + esc(pl.name) + '" style="color:' + pl.color + '">' + v.ch + '</i>'
  } else if (p) e.innerHTML = '<i class="pc' + (anim ? ' dr' : '') + '" title="Au crayon (toi seul·e le vois)">' + p.toLowerCase() + '</i>'
  else e.innerHTML = ''""", """    e.innerHTML = nb + '<i' + (anim ? ' class="st"' : '') + ' title="' + esc(pl.name) + '" style="color:' + pl.color + '">' + v.ch + '</i>'
  } else if (p) e.innerHTML = nb + '<i class="pc' + (anim ? ' dr' : '') + '" title="Au crayon (toi seul·e le vois)">' + p.toLowerCase() + '</i>'
  else e.innerHTML = nb""")
s = sub(s, "function defOf(w) { const a = defs[w.d][w.line] || []; return { t: a[w.k] || '—', n: a.length } }", "const defOf = w => meta.clues[w.id] || '—'\nconst sensTxt = w => w.n + (w.d === 'h' ? ' horizontal' : ' vertical')")
s = sub(s, """    const d = defOf(w)
    $('dlabel').textContent = (w.line + 1) + (w.d === 'h' ? ' horizontal' : ' vertical')
    $('dtext').innerHTML = esc(d.t) + (d.n > 1 ? ' <span style="color:#8a8273">(' + (w.k + 1) + '/' + d.n + ')</span>' : '')""", """    $('dlabel').textContent = sensTxt(w)
    $('dtext').innerHTML = esc(defOf(w)) + ' <span style="color:#8a8273">(' + w.cells.length + ')</span>'""")
s = sub(s, """    const li = (w.d === 'h' ? $('lh') : $('lv')).querySelector('li[data-l="' + w.line + '"]')
    if (li) { li.classList.add('act'); li.querySelector('span[data-k="' + w.k + '"]')?.classList.add('on'); if (scroll)""", """    const li = (w.d === 'h' ? $('lh') : $('lv')).querySelector('li[data-id="' + w.id + '"]')
    if (li) { li.classList.add('act'); if (scroll)""")
a = s.index('function liHTML(d, i) {'); b = s.index('// ---------- saisie ----------')
s = s[:a] + """function liHTML(w) {
  return '<b>' + w.n + '.</b> <span>' + esc(defOf(w)) + '</span> <em class="ln">(' + w.cells.length + ')</em>' + patTxt(w)
}
function list(d, ol) {
  ol.innerHTML = W[d].map(w => '<li data-id="' + w.id + '">' + liHTML(w) + '</li>').join('')
  ol.onclick = e => {
    const li = e.target.closest('li'); if (!li) return
    const w = W.byId[li.dataset.id]; if (!w) return
    const empty = w.cells.find(([r, c]) => !cells[key(r, c)]) || w.cells[0]
    sel = { r: empty[0], c: empty[1], d }
    refresh(); kbFocus()
    if (MOBILE) $('defbar').scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
}
function updLines(r, c) {
  for (const w of Object.values(byCell[key(r, c)] || {})) { const li = document.querySelector('li[data-id="' + w.id + '"]'); if (li) li.innerHTML = liHTML(w) }
}

""" + s[b:]
s = sub(s, "const sens = id => { const [d, l] = id.split('-'); return (+l + 1) + (d === 'h' ? ' horizontal' : ' vertical') }", "const sens = id => W.byId[id] ? sensTxt(W.byId[id]) : (id[0] === 'h' ? 'horizontal' : 'vertical')")
open(p, 'w').write(s)
assert 'defs[' not in s and 'w.line' not in s, 'reste ancien code'

# ---------- admin.html (pages.py) ----------
p = P + 'tools/pages.py'; s = open(p).read()
a = s.index('    <p class="k">2. Les cases noires</p>'); b = s.index('    <p class="k">4. Le journal du jour</p>')
s = s[:a] + """    <p class="k">2. La grille</p>
    <div class="outils">
      <div class="mode" id="ed-mode"><button class="on" data-m="noir">Cases noires</button><button data-m="def">Définitions</button></div>
      <label class="sym"><input type="checkbox" id="ed-sym" checked> Symétrie</label>
      <span class="etat" id="ed-compte"></span><button class="pbtn" id="ed-vider">Tout blanchir</button>
    </div>
    <p class="msg" id="ed-aide"></p>
    <div class="ed-wrap">
      <div class="ed-vp"><div class="g ed" id="ed-g"></div></div>
      <div class="defin">
        <p class="k" style="margin-top:0">3. Les définitions <span class="etat" id="ed-manque"></span></p>
        <h3 class="rub2 ink">Horizontalement</h3>
        <div class="dl" id="d-h"></div>
        <h3 class="rub2 ink">Verticalement</h3>
        <div class="dl" id="d-v"></div>
      </div>
    </div>

""" + s[b:]
open(p, 'w').write(s)

# ---------- CSS ----------
p = P + 'tools/extra.css'
open(p, 'a').write("""
/* numéros dans les cases */
.c b.num{position:absolute;top:1px;left:2px;font:700 calc(var(--cs)*.3)/1 Narrow,sans-serif;color:#4a453c;pointer-events:none;letter-spacing:0}
.defs li em.ln{font-style:normal;color:#8a8273;font-size:12px}
/* éditeur */
.ed .c.hl{background:#dde6dc}.ed .c.hs{background:#bcd3c1}
.ed.def .c{cursor:pointer}
.sym{display:flex;align-items:center;gap:6px;font:700 11px/1 Narrow,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#4a453c;cursor:pointer}
.dl{max-height:340px;overflow:auto;margin:4px 0 14px;padding-right:4px}
.dl p{display:flex;align-items:center;gap:6px;padding:2px 0;border-bottom:1px dotted #b0a897}
.dl p b{font:700 12px/1 Narrow,sans-serif;min-width:28px;text-align:right}
.dl p input{flex:1;min-width:0;font:400 14px/1.3 Times,serif;color:var(--ink);background:transparent;border:0;padding:4px 2px;outline:0}
.dl p input:focus{background:#f3efe5}
.dl p em{font:400 12px/1 Narrow,sans-serif;color:var(--grey);font-style:normal;white-space:nowrap}
.dl p.vide b{color:#b3261e}
.dl p.act{background:#e2e9df}
""")

# ---------- tests ----------
p = P + 'tools/e2e.mjs'; s = open(p).read()
a = s.index('const defsH'); b = s.index('const meta = await')
s = s[:a] + "import { words as _w } from '../public/js/shared.js'\nconst _W = _w({ rows: R, cols: C, blacks: bl }), clues = {}\nfor (const w of [..._W.h, ..._W.v]) clues[w.id] = w.d === 'h' ? 'Petit cours d’eau (' + w.n + ')' : 'Bien arrosé, ' + w.n\n" + s[b:]
s = sub(s, 'defsH, defsV,', 'clues,')
open(p, 'w').write(s)
p = P + 'tools/test_unfound.mjs'; s = open(p).read()
s = sub(s, "defsH: ['Animal.'], defsV: []", "clues: { 'h-0-0': 'Animal.' }")
open(p, 'w').write(s)
print('ok')
