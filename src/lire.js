// Lecture des définitions sur une capture de journal, avec l'IA de Cloudflare (binding AI du wrangler.toml)
const MODELE = '@cf/meta/llama-4-scout-17b-16e-instruct'
const CONSIGNE = `Tu lis la capture d'une page de mots croisés français. Recopie exactement toutes les définitions, sans les résoudre.
Réponds uniquement avec du JSON, sans aucun autre texte : {"h":[{"n":1,"t":"..."}],"v":[{"n":1,"t":"..."}]}
- h = les définitions HORIZONTALEMENT, v = les définitions VERTICALEMENT.
- n = le numéro de la définition, t = son texte exact, sans le numéro.
- Recolle les mots coupés en fin de ligne par un tiret (« grat-ter » devient « gratter »), garde les vrais traits d'union.
- Garde la ponctuation, les guillemets et les majuscules d'origine.
- Ignore le titre, l'auteur, la grille et les solutions.
- Si une seule direction est visible, laisse l'autre liste vide.`

export async function lireDefs(env, image) {
  let r
  try {
    r = await env.AI.run(MODELE, {
      messages: [
        { role: 'system', content: CONSIGNE },
        { role: 'user', content: [{ type: 'text', text: 'Recopie les définitions de cette capture.' }, { type: 'image_url', image_url: { url: image } }] }
      ],
      max_tokens: 6000, temperature: 0
    })
  } catch (e) { throw new Error('la lecture a échoué (' + ((e && e.message) || e) + ')') }
  return nettoyer(r && r.response)
}

// Accepte un objet ou un texte contenant du JSON ; renvoie { h:[{n,t}], v:[{n,t}] }
export function nettoyer(x) {
  let o = x
  if (typeof o === 'string') {
    const a = o.indexOf('{'), b = o.lastIndexOf('}')
    if (a < 0 || b < a) throw new Error('réponse illisible')
    try { o = JSON.parse(o.slice(a, b + 1)) } catch { throw new Error('réponse illisible') }
  }
  const out = { h: [], v: [] }
  for (const d of ['h', 'v']) for (const e of (o && Array.isArray(o[d]) ? o[d] : [])) {
    const n = parseInt(e && e.n, 10), t = String((e && e.t) || '').replace(/\s+/g, ' ').trim().slice(0, 300)
    if (n > 0 && n < 1000 && t) out[d].push({ n, t })
  }
  return out
}

// Mots de la solution : une planche de mots isolés numérotés, longueurs connues
export async function lireMots(env, image, longueurs) {
  const n = longueurs.length
  const consigne = `L'image montre ${n} lignes numérotées de 1 à ${n}. Après chaque numéro, il y a un mot français écrit en lettres capitales, une lettre par carré.
Recopie chaque mot exactement, lettre par lettre, sans le corriger ni le compléter (ce sont des solutions de mots croisés : sigles, abréviations et mots étranges sont normaux).
Nombre de lettres de chaque mot : ${longueurs.map((l, i) => (i + 1) + ' → ' + l).join(', ')}.
Réponds uniquement avec du JSON, sans aucun autre texte : {"mots":["..."]} avec les ${n} mots dans l'ordre, sans espace. Mets ? pour une lettre illisible.`
  let r
  try {
    r = await env.AI.run(MODELE, {
      messages: [
        { role: 'system', content: consigne },
        { role: 'user', content: [{ type: 'text', text: 'Recopie les ' + n + ' mots.' }, { type: 'image_url', image_url: { url: image } }] }
      ],
      max_tokens: 2000, temperature: 0
    })
  } catch (e) { throw new Error('la lecture a échoué (' + ((e && e.message) || e) + ')') }
  return { mots: nettoyerMots(r && r.response, longueurs) }
}

// Un mot par longueur attendue ; null si la longueur ne colle pas
export function nettoyerMots(x, longueurs) {
  let o = x
  if (typeof o === 'string') {
    const a = o.indexOf('{'), b = o.lastIndexOf('}')
    if (a < 0 || b < a) throw new Error('réponse illisible')
    try { o = JSON.parse(o.slice(a, b + 1)) } catch { throw new Error('réponse illisible') }
  }
  const L = (o && Array.isArray(o.mots)) ? o.mots : []
  return longueurs.map((l, i) => {
    const m = String(L[i] || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z?]/g, '')
    return m.length === l ? m : null
  })
}
