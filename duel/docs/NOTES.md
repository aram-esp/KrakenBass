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
- 2.5D client (`web/src/view3d.ts`, default view since 2026-10-30): 3D board in perspective, each figure is its
  `assets/sprites/<id>.png` standing on the team-coloured base as a camera-facing billboard (`THREE.Sprite`, cropped to its
  opaque pixels, nearest-neighbour filtering, `SPRITE_UNIT` sets the size). Falls back to the sphere placeholder with no
  sprite (e.g. the published single-file page); a `.glb` model still wins over the sprite.
- Camera (2.5D): `CAMERA_ELEVATION` 36° (52° on portrait screens), moved in as close as possible while every node and
  figure stays in view (`fitCamera`). Data Disks spin ~1.7 s and stop on the spun segment under a fixed pointer; nobody
  acts and the AI waits until they close; a click jumps to the result, another closes them; no spin with reduced motion.
  Under each disk: the move spun, then what the opposing spin did to that figure: "Recibe X de daño → al P.C." (red, it was
  knocked out), "Para X de daño" (green, the opposing attack had damage but did not knock it out) or "Sin daño".
- Top-down 2D client (`web/src/view2d.ts`, "Vista 2D" button), Data Disk overlay.
- Published private page: https://claude.ai/artifact/Vzjn9KMkhTU6uZTTv96tPf (single-file build, `publish/`). Version 2
  (2026-10-30): 2.5D + 2D views with the BW sprites embedded as data: URIs (`#data-sprites`, ~1.5 MB page).
- Tests: `npm test` -> 21 passing.
- 2D sprites: PokeAPI *black-white* sprites (96x96) for all 567 figure entries, in `assets/sprites/<figure id>.png`
  (committed). Source downloads in `assets/pokeapi/` (see section 7). Branch `claude/wonderful-meitner-iwcl2k` merged
  this branch in on 2026-10-30 and carries all of this.
- Game version: duels use only figures released in the launch version 1.0.0 (82 figures: 42 C, 23 UC, 14 R, 3 EX),
  each with its 1.0.0 wheel (`GAME_VERSION` in `src/data.ts`, `figurePool`; release versions from Bulbapedia). Asked
  by the user on 2026-10-30, after first trying '3.0.12' (before the Mega update 4.0.0, 265 figures). `null` = all 562
  figures with their newest wheels. The published page carries every wheel version and applies the same cut.
  Pinsir's 1.0.0 wheel sums to 108, not 96 (data error, one of the known ones); the engine uses the real total.
- Spanish design summary of Duel: `docs/diseno-pokemon-duel.md` (shorter than `research/FINDINGS.md`, which wins on conflicts).

Not done: plates, attack/ability effects, special conditions, evolution, Mega Evolution, Z-Moves, figure levels,
timers, forfeit, choosing the battle target (the engine takes the first adjacent enemy for AI; the UI lets the human pick).

## 3. Known issues / next steps (priority order)
1. Published page is current (2.5D + 2D, sprites embedded by `publish/build.py`). Rebuild and republish after changes.
   Fixed on 2026-10-30: `#sidem` crash on `web/index.html`, and the hidden canvas still showing (CSS `display:block`
   beat the `hidden` attribute, so the 3D canvas covered the buttons) in both `web/index.html` and `publish/template.html`.
2. The AI wins in ~3 turns if the human does nothing (straight rush to the goal); expected with the current simple AI.
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
- `tools/download_sprites.py` downloads PokeAPI sprites to `assets/pokeapi/<set>/`; `tools/import_sprites.py` copies
  them (or any sprites) to `assets/sprites/<figure id>.png`.
- `assets/models/` git-ignored except its README; `assets/sprites/` and `assets/pokeapi/` are committed.

## 6. Data files
- `figures.json` (from Bulbapedia): `title`, `id` (figure id), `name`, `type`, `mp`, `rarity`, `evostage`, `abilities`
  by version, `wheels` by version (each segment: `kind` duelattack|duelzmove, `color`, `name`, `power`, `prob`, `stars`,
  `effect`), release info. The engine uses the first (newest) wheel and skips Z-Moves. Wheel size is 96 (+4 at max level).
- `plates.json`: 165 plates; `variants` hold description/cost/gems per version. Ids are sparse in the source itself.
- `abilities.json`: 364 abilities (Serebii, v7.0.14+) with effect text and figure names.
- `board.json`: nodes, edges, `goals`, `spawns`, `layout` (pixel coords from a gameplay screenshot). Player 0 is the bottom side.
- `figures_serebii.json`, `figures_serebii_index.json`, `plates_serebii.json`, `patches_serebii.json`,
  `version_history_rule_lines.json`, `wheel_crosscheck_diffs.json`: cross-check material.
- Names are the real species names. Third-party images in the repo: the PokeAPI sprites in `assets/` (see section 7).

## 7. Sprites and models
The user asked (2026-10-30) to use the PokeAPI *black-white* sprites, so they are committed:
```bash
python3 tools/download_sprites.py bw                       # -> assets/pokeapi/bw/ (1-1025 + forms 10001+), skips existing
python3 tools/import_sprites.py assets/pokeapi/bw --pokeapi  # -> assets/sprites/<figure id>.png, 566 ids = all 567 entries
```
`--pokeapi` strips the `NNNN-` prefix and maps form names (Mega X -> x-mega, Alolan X -> x-alola, Heat Rotom -> rotom-heat,
Black Kyurem -> kyurem-black, Dusk Mane Necrozma -> necrozma-dusk, Primal X -> x-primal, Nidoran♂ -> nidoran-m).
In PokeAPI's black-white folder, 1012 of species 1-1025 are byte-identical to its default sprites (13 differ, ids 59-696).
`assets/pokeapi/default` and `assets/pokeapi/emerald` (Gen III, only 1-386) are also there but unused.

To use other art instead:
- **3D models:** `assets/models/<figure id>.glb` (see `assets/models/README.md`). The 3D view scales it to ~0.85 board units.
- **2D sprites:** `assets/sprites/<figure id>.png` (the 2D view draws it instead of the placeholder creature).
- `<figure id>` is the `id` in `data/figures.json`. It is **not** the National Dex number, and files are usually named
  by dex number, so files must be matched by name:
  ```bash
  python3 tools/import_sprites.py path/to/folder            # files named pikachu.png, mr-mime.png ...
  python3 tools/import_sprites.py path/to/folder --map m.csv   # m.csv columns: file,name (e.g. 25.png,Pikachu)
  python3 tools/import_sprites.py path/to/folder --dry-run
  ```
  Every figure with the same name gets the image (variants and duplicates share it).
- The single-file published page cannot load files: `publish/build.py` embeds `assets/sprites/*.png` as data: URIs
  (`web/src/shared.ts` `spriteSrc`). Models (`.glb`) are not embedded and only work with `npm run serve`.
- Mind the licence of whatever you add. Pokémon sprites belong to Nintendo / Game Freak / The Pokémon Company; the author
  said the project is private and non-commercial. An earlier session declined to download third-party art; the user later
  asked for the PokeAPI sprites explicitly.

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
