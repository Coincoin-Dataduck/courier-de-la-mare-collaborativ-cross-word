// Serveur local de test : imite Cloudflare (Worker + Durable Objects + WebSockets) sans internet.
// node tools/dev.mjs  ->  http://localhost:8787  (secret admin : "test")
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { WebSocketServer } from 'ws'
import worker, { Grid, Registry } from '../src/worker.js'

const PUB = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public')
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.otf': 'font/otf' }

function storage() {
  const m = new Map(), clone = v => v === undefined ? v : structuredClone(v)
  return {
    async get(k) { return clone(m.get(k)) },
    async put(k, v) { m.set(k, clone(v)) },
    async delete(k) { for (const x of [].concat(k)) m.delete(x) },
    async list({ prefix = '' } = {}) { return new Map([...m].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => a < b ? -1 : 1).map(([k, v]) => [k, clone(v)])) },
    async deleteAll() { m.clear() }
  }
}
function makeNs(Cls) {
  const inst = new Map()
  return {
    idFromName: n => n,
    get(id) {
      if (!inst.has(id)) {
        const sockets = new Set()
        const ctx = { storage: storage(), blockConcurrencyWhile: f => f(), acceptWebSocket: w => sockets.add(w), getWebSockets: () => [...sockets], _sockets: sockets }
        const o = new Cls(ctx, env); o._ctx = ctx
        inst.set(id, o)
      }
      const o = inst.get(id)
      return { fetch: (u, init) => o.fetch(u instanceof Request ? u : new Request(u, init)), _o: o }
    }
  }
}
const env = {
  ADMIN_SECRET: 'test',
  ASSETS: { fetch: async req => { const p = new URL(req.url).pathname; const f = path.join(PUB, p); if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return new Response('Not found', { status: 404 }); return new Response(fs.readFileSync(f), { headers: { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' } }) } }
}
env.GRID = makeNs(Grid); env.REGISTRY = makeNs(Registry)

const server = http.createServer(async (req, res) => {
  const url = 'http://' + req.headers.host + req.url
  const p = new URL(url).pathname
  let r
  const st = path.join(PUB, p)
  if (!/^\/(g|admin|api)\//.test(p) && p !== '/' && fs.existsSync(st) && fs.statSync(st).isFile()) r = await env.ASSETS.fetch(new Request(url))
  else {
    const chunks = []; for await (const c of req) chunks.push(c)
    const body = chunks.length && req.method !== 'GET' ? Buffer.concat(chunks) : undefined
    r = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, body }), env)
  }
  res.writeHead(r.status, Object.fromEntries(r.headers))
  res.end(Buffer.from(await r.arrayBuffer()))
})
const wss = new WebSocketServer({ noServer: true })
server.on('upgrade', (req, sock, head) => {
  const m = req.url.match(/^\/api\/g\/([a-z0-9]{8})\/ws/)
  if (!m) return sock.destroy()
  const g = env.GRID.get(m[1])._o
  if (!g.meta) return sock.destroy()
  wss.handleUpgrade(req, sock, head, raw => {
    let att = null
    const w = { send: s => raw.send(s), close: (code, reason) => { try { raw.close(code, reason) } catch {} }, serializeAttachment: a => { att = structuredClone(a) }, deserializeAttachment: () => att }
    g._ctx.acceptWebSocket(w); w.serializeAttachment({ pid: null })
    raw.on('message', d => g.webSocketMessage(w, d.toString()))
    raw.on('close', () => { g._ctx._sockets.delete(w); g.webSocketClose(w) })
  })
})
server.listen(8787, () => console.log('http://localhost:8787  admin: /admin/test'))
