# Le Courrier de la Mare — collaborative crosswords

Crossword grids copied from the newspaper, solved together in real time, with no accounts. The interface is in French; this README is in English.

## What's inside

- `public/`: the pages (grid, admin "newsroom", grid not found), styles, fonts.
- `src/worker.js`: the Cloudflare Worker (routes and API).
- `src/grid.js`: one grid = one Durable Object (letters, players, found words, real time).
- `src/registry.js`: the list of grids.
- `tools/dev.mjs`: a small local server to try things without Cloudflare.

## Deploying (once)

You need a Cloudflare account (the free plan is enough) and Node.js 20+.

```sh
npm install
npx wrangler login
npx wrangler secret put ADMIN_SECRET     # a long secret, letters, digits and hyphens only, e.g. Qm8r-2xVt-91Lp
npx wrangler deploy
```

Wrangler prints the site address, something like `https://courrier-de-la-mare.<you>.workers.dev`.

- Admin: `https://…/admin/<your secret>`
- A grid: `https://…/g/<id>` (the link is shown in the admin)

You can also connect the GitHub repository in the Cloudflare dashboard (Workers & Pages → Create → Import a repository, deploy command `npx wrangler deploy`) so every push redeploys automatically. Set `ADMIN_SECRET` under Settings → Variables and Secrets, as a Secret.

Custom domain: Cloudflare dashboard → Workers → courrier-de-la-mare → Settings → Domains & Routes.

> Why a Worker and not Cloudflare Pages? Real time relies on Durable Objects, which live in a Worker. The Worker also serves the static pages: this is Cloudflare's currently recommended setup, and it stays free.

## Running locally

```sh
npm install
npx wrangler dev          # the real Cloudflare runtime, locally
```

Create a `.dev.vars` file with `ADMIN_SECRET=test`, then open `http://localhost:8787/admin/test`.

(Without Wrangler: `npm i ws` then `node tools/dev.mjs` starts a simple imitation, secret `test`.)

## Updating the code without losing grids

Grids and letters live in Cloudflare storage (Durable Objects), not in the code. Pushing a new version does not erase them. One rule: never remove or rename the `durable_objects` and `migrations` sections of `wrangler.toml`.

## Building a grid (admin)

- **One number per word**, as in French newspapers: every cell that starts a word gets a small number, computed automatically left to right, top to bottom. An across and a down word can share a number.
- **Black cells**: "Cases noires" mode, click or drag. The **symmetric** cell (180° rotation) follows; untick "Symétrie" for grids without symmetry.
- **Clues**: "Définitions" mode. Click a cell (a second click toggles across/down) or a line in the list, type the clue, **Enter** goes to the next word. A counter shows words without a clue.
- A clue is attached to the start cell of its word, so moving a black cell elsewhere does not lose it.

## Game rules in the code

- Typewriter ("Machine"): the letter is sent to everyone, in the player's ink.
- Pencil ("Crayon"): the letter stays in that person's browser. Nobody else sees it.
- A word is found when all its letters are typed. It goes to whoever places the last letter.
- Erasing or correcting a letter of a found word un-finds it and removes the point. When complete again, it goes to whoever places the last letter.
- Grid fully typed: "Tamponné", then "Double tamponné".
- Grids never expire. They are deleted from the admin.

## Players and devices

- No accounts: each browser gets an id kept in local storage, with the chosen name and ink colour.
- Name or colour can be changed with "Changer" under the ranking.
- If someone types a name already used on the grid (case and accents ignored), they are asked "C'est toi ?" ("Is that you?"). Yes: they take over the same player (points and colour), e.g. on a second device. No: they pick another name. Pencil marks stay on each device.

## Known limits

- Answers are not checked (nobody knows them).
- Anyone with a grid link can play. Links are long enough not to be guessed.
- Without accounts, anyone can claim an existing name on a grid. Fine among friends.
