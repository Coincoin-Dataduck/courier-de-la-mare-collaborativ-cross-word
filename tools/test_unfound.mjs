// Test : un mot trouvé puis corrigé perd son point
import WebSocket from 'ws'
const B = 'http://localhost:8787'
const meta = await (await fetch(B + '/api/admin/test/grids', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: 3, cols: 3, blacks: '000111111', defsH: ['Animal.'], defsV: [] }) })).json()
const st = () => fetch(B + '/api/g/' + meta.id + '/state').then(r => r.json())
const msgs = []
const ws = new WebSocket('ws://localhost:8787/api/g/' + meta.id + '/ws')
await new Promise(r => ws.on('open', r))
ws.on('message', d => msgs.push(JSON.parse(d.toString()).t))
const send = m => ws.send(JSON.stringify(m)), wait = ms => new Promise(r => setTimeout(r, ms))
send({ t: 'hello', pid: 'p1', name: 'Clément', color: '#1e3f8a' })
for (const [c, ch] of [[0, 'C'], [1, 'H'], [2, 'T']]) send({ t: 'put', r: 0, c, ch })
await wait(200); let s = await st(); console.log('1. CHT posé :', s.scores, s.foundIds)
send({ t: 'del', r: 0, c: 2 }); await wait(200); s = await st(); console.log('2. lettre effacée :', s.scores, s.foundIds)
send({ t: 'put', r: 0, c: 2, ch: 'T' }); await wait(200); send({ t: 'put', r: 0, c: 1, ch: 'A' }); await wait(200); s = await st(); console.log('3. corrigé en CAT par remplacement :', s.scores, s.feed.map(f => f.word))
console.log('messages reçus :', msgs.filter(t => /found/.test(t)).join(' '))
ws.close(); process.exit(0)
