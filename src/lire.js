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
