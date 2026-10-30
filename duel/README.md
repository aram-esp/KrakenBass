# Duel (from scratch)

A board-game duel in the style of Pokémon Duel: rules engine (TypeScript, no runtime deps), real figure/plate/board data,
a simple AI, and a 2.5D web client (Three.js board, PokeAPI BW sprites as billboards) plus a top-down 2D view.

```bash
npm install          # esbuild + three (dev only)
npm test             # engine, data and 200 simulated AI duels
npm run build        # bundles web/src/main.ts -> web/dist/app.js
npm run serve        # then open http://localhost:8080/web/index.html
```

Play: click one of your figures (board or bench strip), green discs are legal destinations, click one to move;
click an adjacent enemy to battle (ends the turn); "Terminar turno" passes. After each battle both Data Disks are shown.

## What is modelled
Board (28 nodes), entry points, MP and the first-turn MP-1, bench entry for 1 MP, one move per turn, adjacency battles with
the real colour table, P.C. (2 slots), Wait, encirclement KO, goal win, Wait win (no legal action), 300-turn limit.
Figures and wheels as of the launch version 1.0.0: 82 figures (`GAME_VERSION` in `src/data.ts`).
Figures are collected from boosters (gacha after the original's timed boosters, `src/gacha.ts`).
Battles as in the original, with special conditions and attack effects (`src/effects.ts`).
Abilities as in 1.0.0 (`src/abilities.ts`); secondary types on the cards.
Figures evolve outside battle after 5 battles or 10 duels in your deck (`data/evolutions.json`, from PokeAPI).
Stages with no Duel figure are invented (previous wheel +10 / +1★). They inherit the previous stage's ability. In-game Pokédex: Pokédex tab (`web/src/wiki.ts`).
Not yet: plates, Mega Evolution, Z-Moves, per-figure levels, timers.

Full project state, decisions, known issues and next steps: `docs/NOTES.md`. Rule sources and open questions: `research/FINDINGS.md`.
The 2D view uses PokeAPI *black-white* sprites (`assets/sprites/`, made with `tools/download_sprites.py` and
`tools/import_sprites.py --pokeapi`; see `docs/NOTES.md` section 7). Other models: `assets/models/README.md`.
Spanish design summary: `docs/diseno-pokemon-duel.md`. The browser console shows harmless 404s while it checks for
optional models in `assets/models/`.
