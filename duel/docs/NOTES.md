# Project notes (state as of 2026-10-30)

Everything learned and decided so far, so the project can be continued by hand or in a new session.
Rules sources and open questions in detail: `research/FINDINGS.md`.

## 1. What this is
A from-scratch board game in the style of Pokémon Duel (mobile figure game by HEROZ / The Pokémon Company, shut down
31 Oct 2019). Pure-TypeScript rules engine, real figure/plate/board data reconstructed from public wikis, a simple AI,
and two web views (3D Three.js, 2D Canvas). The author said it is private, non-commercial and will not be published.

Working agreements with the user: reply in Spanish; never invent facts, and label anything assumed; keep the current
date in mind; do not do unrequested work.

## 2. Status
Done (all committed and pushed on branch `claude/keen-albattani-dr7nco`):
- Research: Bulbapedia (MediaWiki API), Serebii, a Fandom archive wiki, WikiDex, tutorial/version-history pages.
- Engine (`src/`): board graph, MP movement, bench entry (1 MP), first-turn MP-1, one move per turn, adjacency
  battles with the real colour table, P.C. (2 slots), Wait, encirclement KO, goal win, Wait win, 300-turn limit.
- Data (`data/`): 567 figures with wheels, 165 plates, 364 abilities, board (28 nodes, 34 edges + layout), patch notes.
- AI (`src/ai.ts`): heads for the goal, battles when adjacent. 200 simulated AI-vs-AI duels terminate legally.
- 3D client (`web/src/view3d.ts`) and 2D client (`web/src/view2d.ts`) with placeholder pieces, Data Disk overlay.
- Published private page (3D only): https://claude.ai/artifact/Vzjn9KMkhTU6uZTTv96tPf (single-file build, `publish/`).
- Tests: `npm test` -> 19 passing.

Not done: plates, attack/ability effects, special conditions, evolution, Mega Evolution, Z-Moves, figure levels,
timers, forfeit, choosing the battle target (the engine takes the first adjacent enemy for AI; the UI lets the human pick).

## 3. Known issues / next steps (priority order)
1. **Dev page bug:** `web/src/match.ts` sets `#sidem` unconditionally. That element only exists in `publish/template.html`,
   so `web/index.html` throws on load. Fix: `const sm = document.getElementById('sidem'); if (sm) sm.innerHTML = ...`.
   Then rebuild (`npm run build`), test the 2D view, rebuild `publish/` and republish the artifact.
2. Update the published page to include the 2D view (it is still the 3D-only version `61639a5`).
3. Implement plates (data is ready in `data/plates.json`), then attack/ability effects, special conditions, Mega, Z-Moves.
4. Review the 70 wheels that differ between Bulbapedia and Serebii (`data/wheel_crosscheck_diffs.json`; mostly patch drift)
   and 12 wheels whose pieces do not sum to 96, plus 14 attack rows with no colour in `data/figures.json`.
5. The turn timer (5 min each) and forfeit are not modelled.

## 4. Run, test, build, publish
```bash
cd duel
npm install                 # esbuild + three (dev only)
npm test                    # node --test (Node >= 22.6 runs the .ts files directly)
npm run build               # web/dist/app.js (bundle for web/index.html)
npm run serve               # http://localhost:8080/web/index.html
# single-file page for the Artifact tool:
npx esbuild web/src/main.ts --bundle --minify --format=iife --outfile=publish/app.min.js && python3 publish/build.py
```
`publish/index.html` is generated (page + minified bundle + trimmed data). Artifact rules used: no doctype/html/head/body,
a `<title>`, inline script/data, dark single theme, phone-width layout. Republish with the Artifact tool using the same
file path to keep the URL.

## 5. Repo map
- `src/` engine: `types.ts`, `rules.config.ts` (colour table, turn limit, MP penalty, P.C. size), `board.ts`, `battle.ts`,
  `game.ts`, `rng.ts`, `data.ts` (figures.json -> engine figure), `ai.ts`.
- `test/` `game.test.ts` (rules), `data_ai.test.ts` (data conversion, AI, 200 simulated duels, rush test).
- `web/` `src/{main,match,shared,view2d,view3d}.ts`, `index.html` (dev page). `Match` drives a list of `View`s.
- `publish/` `template.html`, `build.py`, generated `index.html`.
- `data/` see section 6. `research/` parsers (`parse_*.py`), raw dumps (`raw/`), screenshots (`img/`), `FINDINGS.md`.
- `tools/import_sprites.py` copies sprites you already have to `assets/sprites/<figure id>.png`.
- `assets/` git-ignored except `assets/models/README.md`.

## 6. Data files
- `figures.json` (from Bulbapedia): `title`, `id` (figure id), `name`, `type`, `mp`, `rarity`, `evostage`, `abilities`
  by version, `wheels` by version (each segment: `kind` duelattack|duelzmove, `color`, `name`, `power`, `prob`, `stars`,
  `effect`), release info. The engine uses the first (newest) wheel and skips Z-Moves. Wheel size is 96 (+4 at max level).
- `plates.json`: 165 plates; `variants` hold description/cost/gems per version. Ids are sparse in the source itself.
- `abilities.json`: 364 abilities (Serebii, v7.0.14+) with effect text and figure names.
- `board.json`: nodes, edges, `goals`, `spawns`, `layout` (pixel coords from a gameplay screenshot). Player 0 is the bottom side.
- `figures_serebii.json`, `figures_serebii_index.json`, `plates_serebii.json`, `patches_serebii.json`,
  `version_history_rule_lines.json`, `wheel_crosscheck_diffs.json`: cross-check material.
- Names are the real species names. No third-party images or models are stored anywhere in the repo.

## 7. Adding your own art (models or sprites)
Nothing third-party is included. If you bring your own files:
- **3D models:** `assets/models/<figure id>.glb` (see `assets/models/README.md`). The 3D view scales it to ~0.85 board units.
- **2D sprites:** `assets/sprites/<figure id>.png` (the 2D view draws it instead of the placeholder creature).
- `<figure id>` is the `id` in `data/figures.json`. It is **not** the National Dex number, and files are usually named
  by dex number, so files must be matched by name:
  ```bash
  python3 tools/import_sprites.py path/to/folder            # files named pikachu.png, mr-mime.png ...
  python3 tools/import_sprites.py path/to/folder --map m.csv   # m.csv columns: file,name (e.g. 25.png,Pikachu)
  python3 tools/import_sprites.py path/to/folder --dry-run
  ```
  Every figure with the same name gets the image (variants and duplicates share it). The folders are git-ignored on purpose.
- The single-file published page cannot load these (no assets folder there); they work with `npm run serve`.
- Mind the licence of whatever you add. In the session the assistant declined to download or extract third-party art
  (game rips, PokeAPI's sprite repo, fan sprites), and the user chose to source them by hand.

## 8. Decisions and findings worth remembering
- Colour table (row beats column): blue beats all; purple beats white and fewer-star purple; gold beats purple; white and
  gold compare damage; red loses to all; same-colour blue/red do nothing. Only white/gold wins knock out.
- First-player MP-1 applies during that player's first turn only. A 3-MP unblocked runner that moves first reaches the goal
  on its third turn (AI rush) because the shortest path is 6 steps + 1 MP to enter.
- Source conflicts: "Wait win" is the opponent-unable-to-act win (Prima Games, tutorial); WikiDex calls the timeout win that.
  Plate cost cap is 8 since v4.0.0 (6 before).
- Board geometry (including the two extra diagonals T2-C1 and B4-C3) was read by eye from one screenshot; it passes a
  180-degree symmetry test but has no second source.
- Bulbapedia's web pages sit behind a Cloudflare challenge: use `api.php` with an identifying User-Agent. WebFetch failed
  with DNS errors in the cloud session while `curl` worked.
- Blocked or unreachable: Reddit wiki, pokemon.com, PokéCommunity, Smogon, Prima Games, GamerBraves (403); `web.archive.org`
  (tunnel failure/429); kaeru.world (521). Not bypassed.

## 9. Open questions
- Mega Evolution after the v6.0.0 revamp, and how the Z-Move gauge fills.
- Whether the first player's MP-1 also hits bench entry for 1-MP figures (assumed yes, by inference).
- Which adjacent enemy is fought when several are adjacent (real game: the player chooses).
- Exact effects of purple and gold wins (the engine only knocks out on white/gold).
