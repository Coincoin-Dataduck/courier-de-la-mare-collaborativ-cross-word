// Le message Discord du matin : ce qui s'est passé la veille, envoyé à 8 h (heure de Paris)
const TZ = 'Europe/Paris'
export const jourParis = ts => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts))
export const heureParis = ts => +new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date(ts))
const veille = j => { const d = new Date(j + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10) }
const jolie = j => new Date(j + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const pl = (n, m) => n + ' ' + m + (n > 1 ? 's' : '')
const titre = (n, un, plusieurs) => '**' + (n > 1 ? plusieurs : un) + '**'

// grilles = les résumés /digest de chaque grille (+ created) ; renvoie le texte, ou null s'il n'y a rien à dire
export function composer(grilles, { hier, aujourdhui, site = '', types = {} }) {
  const T = { neuves: true, terminees: true, corrigees: true, enCours: true, presque: true, ...types }
  const le = ts => !!ts && jourParis(typeof ts === 'string' ? Date.parse(ts) : ts) === hier
  const lien = d => site ? '[Grille n° ' + d.numero + '](<' + site + '/g/' + d.id + '>)' : 'Grille n° ' + d.numero
  const top = d => d.classement.map((x, i) => (i + 1) + '. ' + x.name + ' (' + x.n + ')').join(', ')
  const ds = [...grilles].sort((a, b) => a.numero - b.numero)

  const neuves = ds.filter(d => le(d.created))
  const corrigees = ds.filter(d => d.corr && le(d.corr.ts))
  // terminée puis corrigée le même jour : on ne dit que « corrigée »
  const terminees = ds.filter(d => le(d.finTs) && !corrigees.includes(d))
  const enCours = ds.filter(d => !d.corr && !d.abandon && !d.finTs && !neuves.includes(d))
  const joue = enCours.some(d => le(d.last))
  if (!(T.neuves && neuves.length) && !(T.terminees && terminees.length) && !(T.corrigees && corrigees.length) && !(T.enCours && joue)) return null

  const L = ['**Le Courrier de la Mare** · ' + jolie(aujourdhui).replace(/^./, c => c.toUpperCase())]
  if (T.neuves && neuves.length) {
    L.push('', titre(neuves.length, 'Nouvelle grille', 'Nouvelles grilles'))
    for (const d of neuves) L.push('· ' + lien(d) + ' · ' + d.rows + ' × ' + d.cols + (d.source ? ' · ' + d.source : '') + (d.prevue ? ' · correction prévue ' + jolie(d.prevue) : ''))
  }
  if (T.terminees && terminees.length) {
    L.push('', titre(terminees.length, 'Grille terminée', 'Grilles terminées'))
    for (const d of terminees) L.push('· ' + lien(d) + ' : tous les mots trouvés, tamponnée !' + (d.classement.length ? ' Classement : ' + top(d) + '.' : '') + (d.prevue ? ' Correction prévue ' + jolie(d.prevue) + '.' : ''))
  }
  if (T.corrigees && corrigees.length) {
    L.push('', titre(corrigees.length, 'Grille corrigée', 'Grilles corrigées'))
    for (const d of corrigees) L.push('· ' + lien(d) + ' : ' + (d.corr.cases - d.corr.fautes) + '/' + d.corr.cases + ', ' + (d.corr.fautes ? pl(d.corr.fautes, 'faute') + '.' : 'sans faute, double tamponnée !') + (d.classement.length ? ' Mots justes : ' + top(d) + '.' : ''))
  }
  if (T.enCours && enCours.length) {
    L.push('', '**Toujours en cours**')
    for (const d of enCours) {
      L.push('· ' + lien(d) + ' : il reste ' + (100 - d.pct) + ' %' + (d.prevue ? ', correction prévue ' + jolie(d.prevue) : '') + '.')
      if (T.presque) for (const x of d.presque) L.push('  ' + x.n + (x.d === 'h' ? ' horizontal' : ' vertical') + (x.def ? ' « ' + x.def + ' »' : '') + ' `' + x.pat + '`')
    }
  }
  let t = L.join('\n')
  if (t.length > 1990) t = t.slice(0, 1985) + '\n…'   // limite de Discord : 2000 caractères
  return t
}

// src = { liste, digest, reglages, noter } ; opts : now, force (aperçu/envoi à la main), jour, envoyer
export async function matin(env, src, { now = Date.now(), force = false, jour = null, envoyer = true } = {}) {
  const R = await src.reglages()
  if (!force && (!R.on || heureParis(now) !== +R.heure)) return { envoye: false, raison: 'pas l’heure' }
  const aujourdhui = jourParis(now), hier = jour && /^\d{4}-\d{2}-\d{2}$/.test(jour) ? jour : veille(aujourdhui)
  const fiches = await src.liste()
  const grilles = (await Promise.all(fiches.map(async f => { try { const d = await src.digest(f.id); return d && { ...d, created: f.created } } catch { return null } }))).filter(Boolean)
  const content = composer(grilles, { hier, aujourdhui, site: (R.site || '').replace(/\/$/, ''), types: R.types })
  const noter = async (statut, detail = '') => { if (envoyer) await src.noter({ ts: now, hier, statut, detail, main: force }) }
  if (!content) { await noter('rien'); return { envoye: false, hier, statut: 'rien' } }
  if (!envoyer) return { envoye: false, hier, apercu: content }
  if (!R.webhook) { await noter('echec', 'pas d’adresse de webhook'); return { envoye: false, hier, statut: 'echec', detail: 'pas d’adresse de webhook', apercu: content } }
  let r
  try { r = await fetch(R.webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content, allowed_mentions: { parse: [] } }) }) }
  catch { await noter('echec', 'Discord injoignable'); return { envoye: false, hier, statut: 'echec', detail: 'Discord injoignable', apercu: content } }
  const detail = r.ok ? '' : r.status === 404 || r.status === 401 ? 'Discord ne reconnaît pas le webhook' : 'Discord a répondu ' + r.status
  await noter(r.ok ? 'envoye' : 'echec', detail)
  return { envoye: r.ok, hier, statut: r.ok ? 'envoye' : 'echec', detail, apercu: content }
}
