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

// Lettres de la solution, la grille (taille et cases noires) étant déjà connue
export async function lireSolution(env, image, R, C, B) {
  const motif = Array.from({ length: R }, (_, r) => B.slice(r * C, r * C + C).replace(/1/g, '#').replace(/0/g, '.')).join('\n')
  const consigne = `Cette image montre une grille de mots croisés français remplie (la solution), de ${R} lignes et ${C} colonnes.
Voici où sont les cases noires (# = case noire, . = case avec une lettre) :
${motif}
Recopie les lettres ligne par ligne, de haut en bas, de gauche à droite.
Réponds uniquement avec du JSON, sans aucun autre texte : {"lignes":["..."]}
- exactement ${R} chaînes de ${C} caractères chacune ;
- # pour une case noire, ? pour une lettre illisible ;
- lettres majuscules sans accent. Ne devine pas les mots : recopie ce qui est écrit.`
  let r
  try {
    r = await env.AI.run(MODELE, {
      messages: [
        { role: 'system', content: consigne },
        { role: 'user', content: [{ type: 'text', text: 'Recopie les lettres de cette grille.' }, { type: 'image_url', image_url: { url: image } }] }
      ],
      max_tokens: 3000, temperature: 0
    })
  } catch (e) { throw new Error('la lecture a échoué (' + ((e && e.message) || e) + ')') }
  return { sol: nettoyerSol(r && r.response, R, C, B) }
}

// Remet les lignes lues sur la grille : cases noires imposées, lettres A-Z, ' ' si illisible
export function nettoyerSol(x, R, C, B) {
  let o = x
  if (typeof o === 'string') {
    const a = o.indexOf('{'), b = o.lastIndexOf('}')
    if (a < 0 || b < a) throw new Error('réponse illisible')
    try { o = JSON.parse(o.slice(a, b + 1)) } catch { throw new Error('réponse illisible') }
  }
  const L = (o && Array.isArray(o.lignes)) ? o.lignes : []
  if (!L.length) throw new Error('aucune ligne lue')
  let out = ''
  for (let r = 0; r < R; r++) {
    const s = String(L[r] || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '')
    const blanc = [...B.slice(r * C, r * C + C)].map(v => v === '0')
    let ligne
    if (s.length === C) ligne = [...s]
    else { // longueur fausse : on range les lettres dans les cases blanches, dans l'ordre, si le compte tombe juste
      const lettres = [...s.replace(/#/g, '')]
      if (lettres.length === blanc.filter(Boolean).length) { let k = 0; ligne = blanc.map(b => b ? lettres[k++] : '#') }
      else ligne = [...s.padEnd(C, '?').slice(0, C)]
    }
    for (let c = 0; c < C; c++) out += !blanc[c] ? '#' : /^[A-Z]$/.test(ligne[c]) ? ligne[c] : ' '
  }
  return out
}
