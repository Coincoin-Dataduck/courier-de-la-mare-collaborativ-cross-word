import { chromium } from 'playwright'
const B = 'http://localhost:8787'
const R = 12, C = 14
let s = 7; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
let bl = ''; for (let i = 0; i < R * C; i++) bl += rnd() < .16 ? '1' : '0'
import { words as _w } from '../public/js/shared.js'
const _W = _w({ rows: R, cols: C, blacks: bl }), clues = {}
for (const w of [..._W.h, ..._W.v]) clues[w.id] = w.d === 'h' ? 'Petit cours d’eau (' + w.n + ')' : 'Bien arrosé, ' + w.n
const meta = await (await fetch(B + '/api/admin/test/grids', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: R, cols: C, blacks: bl, clues, source: 'Ouest-France', date: '2026-10-11', saint: 'Firmin', meteoSam: 'Averses, 11°', meteoDim: 'Éclaircies, 14°', soleil: '8 h 07 – 19 h 08', annonces: ['Vends paille. 25 francs les 12 brins.', 'Crapaud cherche princesse. S’adresser à la mare.'] }) })).json()
console.log('grille', meta.id)
const br = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox'] })
const errs = []
async function joueur(name, color) {
  const ctx = await br.newContext({ viewport: { width: 1300, height: 1000 } })
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(name + ' console: ' + m.text()))
  await p.goto(B + '/g/' + meta.id); await p.waitForSelector('#accueil:not(.hide)')
  await p.fill('#nom', name); await p.click(`#encres button[data-c="${color}"]`); await p.click('#go')
  await p.waitForTimeout(400); return p
}
const a = await joueur('Clément', '#1e3f8a'), b = await joueur('Léa', '#a8241c')
// premier mot horizontal de la ligne 1
const w = await a.evaluate(() => { const li = document.querySelector('#lh li'); li.querySelector('span').click(); return document.getElementById('dlabel').textContent })
console.log('mot choisi', w)
const len = await a.evaluate(() => document.querySelectorAll('#pat span').length)
// crayon : 2 lettres
await a.click('#m-pc'); await a.keyboard.type('ab')
await a.waitForTimeout(300)
console.log('crayon chez A', await a.evaluate(() => document.querySelectorAll('.c i.pc').length), 'chez B', await b.evaluate(() => document.querySelectorAll('.c i.pc').length))
// machine : tout le mot en repartant du début
await a.evaluate(() => document.querySelector('#lh li span').click())
await a.click('#m-ink')
await a.evaluate(() => { document.querySelector('#lh li span').click() })
const word = 'CHATONSPAPILLON'.slice(0, len - 1)
await a.keyboard.type(word)
await b.evaluate(() => { document.querySelector('#lh li span').click() })
await b.keyboard.press('End')
// B pose la dernière lettre : on clique la dernière case du mot
await b.evaluate(() => { const c = [...document.querySelectorAll('.c.w')].pop(); c.click() })
await b.keyboard.type('E')
await a.waitForTimeout(600)
for (const [n, p] of [['A', a], ['B', b]]) console.log(n, await p.evaluate(() => ({ cl: document.getElementById('cl').innerText.replace(/\n/g, ' | '), fil: document.getElementById('fil').innerText, av: document.getElementById('avance').innerText, enc: document.querySelectorAll('.c i:not(.pc)').length, curseurs: document.querySelectorAll('.c.o').length })))
await a.screenshot({ path: '/data/courrier/e2e_a.png', fullPage: true })
const m = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const mp = await m.newPage(); await mp.goto(B + '/g/' + meta.id); await mp.waitForTimeout(600); await mp.screenshot({ path: '/data/courrier/e2e_m.png' })
const ad = await (await br.newContext({ viewport: { width: 1300, height: 1000 } })).newPage(); ad.on('pageerror', e => errs.push('admin: ' + e.message))
await ad.goto(B + '/admin/test'); await ad.waitForTimeout(500); await ad.screenshot({ path: '/data/courrier/e2e_admin_liste.png' })
await ad.click('[data-ed="' + meta.id + '"]'); await ad.waitForTimeout(500); await ad.screenshot({ path: '/data/courrier/e2e_admin_ed.png', fullPage: true })
const p404 = await (await br.newContext()).newPage(); const r = await p404.goto(B + '/g/zzzzzzzz'); await p404.waitForTimeout(500); console.log('404 visible', await p404.evaluate(() => !document.getElementById('perdu').classList.contains('hide')))
// suppression -> le joueur voit Astra
await fetch(B + '/api/admin/test/grids/' + meta.id, { method: 'DELETE' }); await a.waitForTimeout(500)
console.log('après suppression, A voit 404', await a.evaluate(() => !document.getElementById('perdu').classList.contains('hide')))
console.log('erreurs', errs)
await br.close()
