# Pokémon Duel research (as of 2026-10-29)

Tags: [BULBA] Bulbapedia (MediaWiki API) · [SEREBII] serebii.net/duel · [FANDOM] pokemonduel-archive.fandom.com
(fan wiki, 2017, older version) · [IMG] read from a screenshot by Claude · [GUESS] not in any source.

## Rules
- 2 players, 6 figures each (deck), up to 6 plates; figures start on the bench. [BULBA][FANDOM]
- Board: 26 points + 2 goals = 28 nodes (`data/board.json`, 34 edges, 180° symmetric). 4 corner entry
  points (2 per player); goal at the centre of each back row. [IMG][official site via search]
- Random first player; the first player's figures get MP-1 (official site: on the first turn; FANDOM: "all figures"). 
- MP 1-3 per figure; one step per MP along routes; entering from the bench via a free entry point costs 1 MP.
  Only one piece is moved per turn. [SEREBII][search summary of pokemon.com]
- Turn: optionally use plate(s) (some end the turn) → move a figure → optionally battle / tag / end turn.
  Starting a battle ends the turn. Battle can start before or after moving, only vs an adjacent enemy. [FANDOM]
- Win: step on opponent goal; "Wait win" = opponent cannot act; opponent out of time (5 min each per FANDOM);
  turn 300 reached with no winner = both lose. [FANDOM][SEREBII]
- KO'd figures go to the P.C. (backup), max 2; a third one sent there pushes the oldest back to the bench. [SEREBII]
- A figure with every adjacent spot held by enemies is KO'd without battle. [BULBA TFG]
- Wait N: cannot move, attack, tag or use abilities for N turns (counts both players' turns); can still be
  targeted by plates; unlike conditions it survives bench/P.C. [BULBA]
- Special conditions (one at a time, new replaces old): Paralyzed, Poisoned (-20 white/gold), Asleep, Confused,
  Burned (para + -10), Frozen (asleep + all attacks Miss), Noxious (-40), Curse (removed from duel when KO'd). [BULBA][SEREBII]
- Tagging an adjacent ally wakes an asleep figure (also: attacking a sleeping enemy). [FANDOM]

## Combat
Each figure has a wheel; both spin. Wheel size is 96 (554/567 figures; levels add up to +4 → 100). `prob` per segment.
Colour table (row = you, col = opponent) [FANDOM chart + text]:
| you \ opp | red | white | purple | gold | blue |
| red | none | opp | opp | opp | opp |
| white | you | cmp | opp | cmp | opp |
| purple | you | you | cmp(★) | opp | opp |
| gold | you | cmp | you | cmp | opp |
| blue | you | you | you | you | none |
Only white/gold wins KO (gold vs purple: any damage > 0). Purple wins apply effects. Ties: nothing. Effects of
"*" attacks apply regardless of damage outcome; effects trigger starting with the player who initiated the battle.

## Progression [BULBA][SEREBII]
Rarity C/UC/R/EX/UX. Level max 5 (Carmonite → 10): each level +1 to a wheel piece. Chain level: +1 damage per level
(fuse same figure or Cubes). Evolution in duel after winning a battle (needs both forms in deck): +10 damage, +1★ on purple.
Mega Evolution: via special plate, lasts 7 turns, 1 per game. Z-Moves: gauge fills as you play; white Z = 2x strongest move
power; 18 type-specific Z-moves (see Serebii mechanics). Plate cost total per deck: 8 (since v4.0.0; was 6); plates once per duel.

## Data files (`duel/data`)
- `figures.json` – 567 figure pages: type(s), MP, rarity, evostage, abilities by version, wheels by version, Z-moves, release info.
- `plates.json` – 165 plates (Bulbapedia table + Serebii for the rest); ids are sparse in BOTH sources, not missing data.
- `plates_serebii.json`, `board.json`.
Parsers: `research/parse_*.py`; raw dumps under `research/raw/`.

## Not found / blocked
- Reddit wiki (r/pokemonduel guide/successors), pokemon.com strategy page, PokéCommunity, Smogon: 403 (anti-bot). Not bypassed.
- kaeru.world 521; GitHub search not allowed in this session (bound to its repos).
- Exact tie/turn-timer details differ by version; Gym Cup/Queen's Cup/Team Match modes are in `raw/pages_wikitext.json` unparsed.
- 13 figures have wheels not summing to 96 (wiki typos or extra segments) and 14 attack rows lack a colour: need review.
- Orbs/"scramble" never appeared in any source: probably not part of Duel.
