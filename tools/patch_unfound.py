p = '/data/courrier/src/grid.js'
s = open(p).read()
old_put = """      this.cells[k] = { ch, pid }
      await st.put('c:' + k, this.cells[k])
      this.broadcast({ t: 'put', r, c, ch, pid })
"""
new_put = """      this.cells[k] = { ch, pid }
      await st.put('c:' + k, this.cells[k])
      this.broadcast({ t: 'put', r, c, ch, pid })
      // Une lettre corrig\u00e9e : les mots qui passaient par l\u00e0 ne sont plus acquis
      if (old) await this.revoke(k)
"""
assert old_put in s
s = s.replace(old_put, new_put)
old_del = """      delete this.cells[k]
      await st.delete('c:' + k)
      this.broadcast({ t: 'del', r, c, pid })
      return
    }
  }
"""
new_del = """      delete this.cells[k]
      await st.delete('c:' + k)
      this.broadcast({ t: 'del', r, c, pid })
      await this.revoke(k)
      return
    }
  }

  // On s'est tromp\u00e9 : le mot n'est plus trouv\u00e9, le point est retir\u00e9
  async revoke(k) {
    for (const w of this.byCell[k] || []) {
      const f = this.found[w.id]
      if (!f) continue
      delete this.found[w.id]
      await this.ctx.storage.delete('f:' + w.id)
      this.broadcast({ t: 'unfound', id: w.id, pid: f.pid })
    }
  }
"""
assert old_del in s
s = s.replace(old_del, new_del)
open(p, 'w').write(s)

p = '/data/courrier/public/js/grille.js'
s = open(p).read()
anchor = "    case 'player': {"
add = """    case 'unfound': { if (scores[m.pid]) scores[m.pid]--; feed = feed.filter(f => f.id !== m.id); ranking(); fil(false); break }
"""
assert anchor in s
s = s.replace(anchor, add + anchor, 1)
open(p, 'w').write(s)
print('ok')
