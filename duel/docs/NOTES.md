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
  figure stays in view (`fitCamera`). Data Disks spin ~3 s (second one 0.35 s later), stop on the spun segment under a fixed
  pointer and stay 2.3 s (`SPIN_MS`, `SPIN_STAGGER`, `HOLD_MS` in `web/src/match.ts`); nobody acts and the AI waits until
  they close. The board, panels, chips, banner and log keep the pre-battle position until the last disk closes
  (`Game.onBeforeBattle` draws the AI's move first; `refresh` is held while `playing`); a click jumps to the result, another closes them; no spin with reduced motion.
  Under each disk: the move spun, then what the opposing spin did to that figure: "Recibe X de daño → al P.C." / "Pierde → al P.C."
  (red), "Gana · para X de daño" / "Gana" (green); a tie shows "Empate: se vuelve a girar" and ability notes in yellow.
- Wheels as in the original again (user, 2026-10-30): `houseRules.decisive = false` (the decisive option still exists,
  with tests). Only a winning white/gold attack with damage knocks out; purple wins apply their effect; blue dodges;
  ties do nothing; * attacks apply their effect whatever the outcome (attacker first).
- Special conditions (`Figure.cond`, rules from Bulbapedia "Special Condition (TFG)" in research/raw/wait.json): poison
  −20, noxious −40, paralysis (smallest-total attack becomes Miss), burn (paralysis + −10), sleep (no move/attack, does not
  block or surround, wakes when attacked or tagged by an adjacent ally: purple target, ends the turn), frozen (sleep + all
  Miss, cleared after a battle, Serebii), confusion (wheel shifted one segment). One at a time; removed off the field.
  Plain "Wait" = skip the owner's next turn (TFG Wait lasts one turn): `Game.gainWait`.
- Attack effects (`src/effects.ts`, `resolveBattle`): the 98 effect texts of our figures, matched by text. Choices the
  original left to a player are automatic. Not applied (shown with the reason): Taunt and Torment (ambiguous texts),
  Crushing Squeeze (Cracked marker, unknown), Play Rough (plates). Simulation tool: 500 AI duels with all 163 figures,
  0 errors.
- Abilities: all of the game's 45 work (`src/abilities.ts`) except Big Chorus (plates), Electromagnetic Barrier (no
  spin-forcing attacks), Slime Barrier (no white attack gives conditions without *), Steel Breaker (Cracked marker).
  Ability moves are purple targets (`Game.specials`: Run Off, Swarm, Forest Leap, Cut Off, tag); Run Away and Sand Veil
  are always used; Metamorphosis evolves in the duel (+10/+1★); figures obtained by evolving count as "evolved".
  Interpretations are listed in `NOTES` (shown in the Pokédex).
- AI and ability moves (`src/ai.ts`, 2026-10-30): Run Off first if the swap brings that figure nearer the goal; wakes a
  sleeping ally unless a move wins; Cut Off to its goal when an enemy is within 2 steps of it; Forest Leap and Swarm are
  scored like moves (Swarm +0.6, it ends the turn). In simulations it uses Run Off, Forest Leap and Cut Off.
- Abilities as in 1.0.0 (21 of the 82 figures have one, read per version from `data/figures.json`); see below.
- Secondary types (`type2`, 31 of 82): shown on cards (types line, base side colour). No type effectiveness (Duel has none).
- 2.5D board restyled after research/img/field.png: pale mottled surface, thick white routes, ring points, concentric
  entry rings, pulsing goals with an arrow (blue = yours, orange = opponent's), bench lines, wooden bases with a team rim.
- Menus (`web/src/menus.ts`, built from JS with their own CSS), styled after two screenshots of the original app on the
  Fandom archive wiki (File:Deck.PNG "Edit Decks", File:Quest.PNG home with "Play"; looked at, not stored): dark blue top
  bar, black pill titles, big yellow buttons, blue bottom tabs (original: BACK, Leagues, Decks, Fusion, Shop, Menu; here
  only Atrás, Liga, Mazos, because the rest does not exist), "Figuras" panel with "Usables n/6" and figures on bases with
  rarity (C/UC/R/EX) and MP badges. Screens: Liga (your deck + "Jugar", "Continuar duelo"), Editar mazo, Editar figuras
  (collection with mini wheels, attacks on hover, rarity filters, 6 distinct figures, "Al azar"/"Vaciar"). Not drawn:
  energy/coins/gems, plates panel, Fusion, Shop (none exist). Font: Nunito (Google Fonts) with system fallback. The deck is kept in localStorage (`duel.deck`, per browser);
  without 6 chosen the player gets a random deck. The AI always gets a random deck. `Match.start(deck)`.
- Gacha (2026-10-30; logic in `src/gacha.ts` + `test/gacha.test.ts`, UI in `web/src/menus.ts`). From the sources: timed
  booster types White 1 h (1 figure), Blue 3 h (1, UC+), Purple 6 h (1, UC+), Gold 12 h (R+ and 1), Rainbow 24 h (EX+ and 2)
  (Fandom "Booster"); 50-gem shop booster (Nintendo Life); boosters in a case on the home screen, openable early with gems
  (Serebii "League"). INVENTED (marked in the code): rarity weights C 60 / UC 28 / R 10 / EX 2, timed type weights
  40/25/20/10/5, case of 4, 20 gems per win and 5 per loss, 1 gem per 10 min left to open early, shop booster = 2 figures
  (one UC+), 4 welcome boosters with 8 different figures. Ingots/metals/cubes left out (no fusion). Only owned figures go in
  the deck; with no deck chosen you play 6 of yours at random. Save in localStorage `duel.gacha` (per browser).
- Evolution outside battle (user, 2026-10-30): a figure can evolve after 5 battles fought or 10 finished duels in the
  player's deck (`EVOLVE_BATTLES`/`EVOLVE_DUELS`, counters in the gacha save). In "Editar mazo" > Evolución one owned
  copy turns into its evolution; it takes its place in the deck if that was the last copy. Chains: `data/evolutions.json`
  (PokeAPI evolution chains, built by `tools/build_evolutions.py`; next species -> its earliest Duel figure). No 1.0.0
  figure evolves into another 1.0.0 figure, so evolutions are figures of later versions (user's choice), with the wheel
  and ability of their own release version (`evolutionPool` in `src/data.ts`): 37 of the 82 can evolve, 58 more figures
  are reachable (e.g. Squirtle > Wartortle > Blastoise). They are only obtained by evolving, never from boosters or by
  the AI. The other 45 have no evolution with a Duel figure (e.g. Psyduck: Golduck never had one).
- Invented evolutions (user, 2026-10-30): a chain stage with no Duel figure becomes an invented figure `x-<species>`
  (23, e.g. Golduck, Fearow, Machoke > real Machamp): wheel = previous stage +10 damage on white/gold and +1 star on purple
  (the original's in-duel evolution bonus, Serebii), previous stage's MP and rarity, real name/types/sprite from PokeAPI. Built by `tools/build_evolutions.py` ("invented" in `data/evolutions.json`, sprites copied to
  `assets/sprites/x-*.png`). They inherit the previous stage's ability (Golduck: Migraine, Kabutops: Battle Armor,
  Ambipom: Run Off, Sandslash: Sand Veil). Regional-only evolutions (Perrserker, Sirfetch'd…) are left out.
- In-game Pokédex (`web/src/wiki.ts`, Pokédex tab; called Wiki until the user renamed it): how to play (MP, turn, colours, house rules), all 163 figures with wheel %,
  ability and status, evolutions; abilities table with the reason each pending one does nothing (`PENDING` in
  `src/abilities.ts`); boosters (invented values tagged); evolution rules. Built only from the game's data and rules.
- Duel screen as in the original (2026-10-30, after research/img/field.png): `web/src/hud.ts` builds it for both the dev
  and the published page (their HTML is now just a shell with #app). Black ticker (last event), blue/red player banners
  with the turn counter, benches standing on the board beyond the bench lines and P.C. "+" slots (`View3D.slots`), MP as a
  team-coloured circle (`drawMpBadge`, yellow W<n> for Wait, condition dot), pulsing yellow rings under figures that can
  act, Data Disk button (selected figure's wheel), yellow "IA" button (the AI plays your turn, as the original's AI
  button), Forfeit (press twice). As in the original the turn ends by itself after a move unless that figure can battle
  or tag. The 2D view keeps chip buttons for the bench.
- Plates (2026-10-30; `src/plates.ts`, all 165 from data/plates.json with the text and cost of their first version).
  Deck: up to 6, total cost <= 6 (Fandom, Nintendo Life); used at the start of your turn before moving (pokemon.com),
  once per duel (Fandom); ASSUMED one per turn. 78 work (turn buffs X Attack/X Defend/Focus Band/…, heals, moves Hurdle
  Jump/Goal Block/Pokémon Switch/…, type powers, held items +20, Recycle, clear duel-long ones: Flame/Steel/Electro
  Energy, Metal/Flame/Electro/Mystic/Aqua/Grass/Dragon/Gold Sphere, Poison Blade, Sticky Grass, Twisted Spoon, Rocky
  Helmet, Air Balloon…). Not usable, with reason (`plateSpec`): Mega stones and orbs (no Mega/Primal), plates for figures
  this game lacks, Z/Ultra Space ones, and ~19 with complex texts. Spots for Long Throw/Hurdle Jump are chosen as the
  free one nearest the opponent's goal. Start with the plates of the original deck screenshot (X Attack x2, Hurdle Jump,
  Goal Block: cost 6); boosters hold a working plate 30 % of the time (INVENTED). The AI gets random working plates
  (cost <= 6) and uses battle boosts, Goal Block, heals and sometimes turn-ending ones (`aiPlate`). UI: PLATES card stack
  at the bottom right; Pokédex section with all 165. 500 simulated duels with plates: 0 errors.
- MP badges: every figure on the board shows the MP it has right now (`Game.mp`, so the first-turn MP-1 is included),
  or "Wait N" in yellow while it waits (`View.setBadges`, `drawBadge` in `web/src/shared.ts`).
- Top-down 2D client (`web/src/view2d.ts`, "Vista 2D" button), Data Disk overlay.
- Published private page: https://claude.ai/artifact/Vzjn9KMkhTU6uZTTv96tPf (single-file build, `publish/`). Version 2
  (2026-10-30): 2.5D + 2D views with the BW sprites embedded as data: URIs (`#data-sprites`, ~1.5 MB page).
- Tests: `npm test` -> 54 passing.
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
5. Duel pace (2026-10-30, user asked for slower turns and more polish): "TU TURNO"/"TURNO RIVAL" banner (1.3 s, nobody
   acts meanwhile), AI waits 1.4 s before each action, moves are timed tweens with a hop, idle bob of sprites, a "VS"
   entrance (0.9 s) before the first spin of a battle, KO'd figures hop/shrink to the P.C. slot. 5-minute clock per
   player (Fandom "Matches": league matches give 5 minutes each); it runs only during that player's turn, pauses during
   banners and spins, and running out = forfeit. Constants in `web/src/match.ts` (AI_STEP_MS, TURN_BANNER_MS, INTRO_MS,
   CLOCK_MS). Whether the original clock paused during spins is NOT sourced (assumed).

6. Progression (2026-10-30, phase 2 of "todo lo del original"): `src/progress.ts` + Mazos → Fusión + Tienda (Vender,
   Intercambio de Material) + Pokédex → Niveles y fusión. Levels 1-5 (+1 to a non-Miss piece per level, 96 -> 100),
   Carmonite levels 6-10 (+1/-1 swap, piece > 4), Chain Level (+1 damage to a white/gold move; EX 1 / R 3 / UC 9 / C 30
   copies or same-rarity Cubes), fusion with figures / Rare Metals / Cubes / Ingots, coins from selling, Material from
   shop boosters, booster enhancements per Bulbapedia "Time Booster". Sourced numbers and INVENTED ones are listed at the
   top of `src/progress.ts` (exp curve, fusion coin cost, duel exp, figure base exp, Chain cap 10, shop Material 100,
   exchange prices except EX 4000, Carmonite for 20 Material). ASSUMED: all copies share one level (original: per copy);
   points can be re-placed. The player's deck plays with `applyProgress`; the AI's figures are not upgraded.
   Still to do from the original: in-duel evolution after winning a battle (only Metamorphosis does it now),
   story mode (Training Center stages and decks are in `research/raw/pages_wikitext.json` "Training Center (Duel)"),
   league ranks (Bulbapedia "League Match": Beginner 0-1299 ... Legend 3000+), Mega Evolution, Z-Moves.

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
