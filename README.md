# Le Courrier de la Mare — mots croisés à plusieurs

Des grilles de mots croisés recopiées du journal, à remplir ensemble, sans compte, en temps réel.

## Ce qu'il y a dedans

- `public/` : les pages (grille, rédaction, grille introuvable), le style, les polices.
- `src/worker.js` : le Worker Cloudflare (les adresses et l'API).
- `src/grid.js` : une grille = un Durable Object (lettres, joueurs, mots trouvés, temps réel).
- `src/registry.js` : la liste des grilles.
- `tools/dev.mjs` : un petit serveur local pour essayer sans Cloudflare.

## Mettre en ligne (une seule fois)

Il faut un compte Cloudflare (le plan gratuit suffit) et Node.js 20 ou plus.

```sh
npm install
npx wrangler login
npx wrangler secret put ADMIN_SECRET     # tape un secret long, ex. Qm8r-2xVt-91Lp
npx wrangler deploy
```

Wrangler affiche l'adresse du site, du genre `https://courrier-de-la-mare.<toi>.workers.dev`.

- La salle de rédaction : `https://…/admin/<ton secret>`
- Une grille : `https://…/g/<identifiant>` (le lien est donné dans la rédaction)

Pour une mise à jour : `npx wrangler deploy` à nouveau. Les grilles ne sont pas touchées.

Nom de domaine à toi : dans le tableau de bord Cloudflare, Workers → courrier-de-la-mare → Settings → Domains & Routes.

> Pourquoi un Worker et pas Cloudflare Pages ? Le temps réel passe par des Durable Objects, qui vivent dans un Worker. Le Worker sert aussi les pages statiques : c'est la manière actuelle recommandée par Cloudflare, et ça reste gratuit.

## Essayer sur son ordinateur

```sh
npm install
npx wrangler dev          # le vrai moteur Cloudflare en local
```

Crée un fichier `.dev.vars` avec `ADMIN_SECRET=test`, puis ouvre `http://localhost:8787/admin/test`.

(Sans Wrangler : `npm i ws` puis `node tools/dev.mjs` lance une imitation simple, secret `test`.)

## Les règles du jeu dans le code

- Les définitions d'une ligne sont séparées par des points (ou `?` `!` `…`). La 1re va au 1er mot de la ligne, la 2e au 2e, etc. Un mot = au moins 2 cases blanches à la suite.
- Machine à écrire : la lettre est envoyée à tout le monde, dans l'encre du joueur.
- Crayon de bois : la lettre reste dans le navigateur de la personne. Personne d'autre ne la voit.
- Un mot est trouvé quand toutes ses lettres sont à la machine. Il compte pour celui ou celle qui pose la dernière lettre.
- Si on efface ou corrige une lettre d’un mot trouvé, le mot n’est plus trouvé et son point est retiré. Quand le mot est de nouveau complet, il revient à la personne qui pose la dernière lettre.
- Grille entièrement remplie à la machine : « Tamponné » puis « Double tamponné ».
- Les grilles n'expirent jamais. On les supprime depuis la rédaction.
- Pas de compte : chaque navigateur reçoit un identifiant gardé en mémoire, avec le nom et la couleur choisis.

## Limites connues

- On ne vérifie pas les réponses (personne ne les connaît).
- Quelqu'un qui connaît le lien d'une grille peut y jouer. Le lien est assez long pour ne pas être deviné.
- Changer le nom ou la couleur se fait avec « Changer » sous le classement.

## Numérotation et saisie d'une grille (version 2)

- **Un numéro par mot**, comme dans Libé ou Le Monde : chaque case qui commence un mot porte un petit numéro, calculé tout seul de gauche à droite puis de haut en bas. Un même numéro peut servir à un horizontal et à un vertical.
- **Cases noires** : mode « Cases noires », clique ou glisse. La case **symétrique** (demi-tour) se noircit en même temps ; décoche « Symétrie » pour les grilles qui n'en ont pas.
- **Définitions** : mode « Définitions ». Clique une case (un 2ᵉ clic passe d'horizontal à vertical) ou directement une ligne de la liste, tape la définition, **Entrée** passe au mot suivant. Le compteur indique les mots sans définition.
- Une définition reste attachée à la case de départ de son mot : déplacer une case noire ailleurs ne la perd pas.

## Mettre à jour le code sans perdre les grilles

Les grilles et les lettres vivent dans le stockage Cloudflare (Durable Objects), pas dans le code. Pousser une nouvelle version sur GitHub ne les efface pas. Seule règle : ne jamais supprimer ni renommer les blocs `durable_objects` et `migrations` de `wrangler.toml`.

Attention : cette version change le format des définitions. Les grilles d'essai créées avec l'ancienne version s'affichent sans définitions : supprime-les et recrée-les.

## Jouer sur plusieurs appareils

Chaque navigateur a son identifiant de joueur. Si quelqu'un tape un pseudo déjà présent sur la grille (majuscules et accents ignorés), on lui demande « C'est toi ? ». Oui : il reprend le même joueur (points et couleur). Non : il choisit un autre nom. Le crayon reste propre à chaque appareil.
