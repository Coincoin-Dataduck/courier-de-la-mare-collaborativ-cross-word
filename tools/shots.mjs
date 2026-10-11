import { chromium } from 'playwright'
import { words } from '../public/js/shared.js'
const B = 'http://localhost:8787'
// petite grille symétrique 9x11
const R = 9, C = 11, pos = [[0,3],[1,7],[2,0],[2,5],[3,9],[4,4],[4,2]]
const bl = Array(R * C).fill('0')
for (const [r, c] of pos) { bl[r * C + c] = '1'; bl[(R - 1 - r) * C + (C - 1 - c)] = '1' }
const blacks = bl.join(''), W = words({ rows: R, cols: C, blacks }), clues = {}
const ex = ['Avec tambour et trompettes, this is Madness', 'Définition à choix multiple', 'Sans ses Guns, il sort Orgy of the Damned en 2024', 'Rongeur', 'Ne se fait pas en un jour']
let i = 0; for (const w of [...W.h, ...W.v]) clues[w.id] = ex[i++ % ex.length]
const m = await (await fetch(B + '/api/admin/test/grids', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: R, cols: C, blacks, clues, source: 'Libération', date: '2026-10-11' }) })).json()
const br = await chromium.launch({ executablePath: process.env.CH, args: ['--no-sandbox'] })
const p = await br.newPage({ viewport: { width: 1280, height: 900 } })
await p.goto(B + '/g/' + m.id); await p.waitForTimeout(800)
const nm = await p.$('#nom'); if (nm) { await p.fill('#nom', 'Clément'); await p.keyboard.press('Enter'); await p.waitForTimeout(500) }
await p.click('.c[data-r="0"][data-c="0"]'); await p.keyboard.type('MAD'); await p.waitForTimeout(600)
await p.screenshot({ path: '/data/s_grille.png' })
const q = await br.newPage({ viewport: { width: 1280, height: 900 } })
await q.goto(B + '/admin/test'); await q.waitForTimeout(600)
await q.click('button[data-ed="' + m.id + '"]'); await q.waitForTimeout(600)
await q.click('#ed-g .c[data-r="0"][data-c="5"]'); await q.waitForTimeout(300)
await q.evaluate(() => document.querySelector('#ed-g').scrollIntoView())
await q.screenshot({ path: '/data/s_admin.png' })
console.log('ok', W.h.length, W.v.length)
await br.close()
