# Pokémon Duel research (as of 2026-10-29)

Tags: [BULBA] Bulbapedia (MediaWiki API) · [SEREBII] serebii.net/duel · [FANDOM] pokemonduel-archive.fandom.com
(fan wiki, 2017, older version) · [IMG] read from a screenshot by Claude · [GUESS] not in any source.

## Rules
- 2 players, 6 figures each (deck), up to 6 plates; figures start on the bench. [BULBA][FANDOM]
- Board: 7 wide x 5 long, inner hollow 3x3 square joined to the outer ring by corner diagonals [WIKIDEX]; 26 points + 2 goals = 28 nodes
  (`data/board.json`, 34 edges, 180° symmetric; two extra diagonals T2-C1 and B4-C3 seen only in the screenshot). 4 corner entry
  points (2 per player); goal at the centre of each back row. [IMG][official site via search]
- Random first player (spinner); during the first turn every figure of the first player has MP-1, back to normal after it.
  [WIKIDEX][official site via search]. Entering from the bench via a free entry point costs 1 MP (so a 1-MP first mover cannot enter: inference).
- MP 1-3 per figure; one step per MP along routes; entering from the bench via a free entry point costs 1 MP.
  Only one piece is moved per turn. [SEREBII][search summary of pokemon.com]
- Turn: optionally use plate(s) (some end the turn) → move a figure → optionally battle / tag / end turn.
  Starting a battle ends the turn. Battle can start before or after moving, only vs an adjacent enemy. [FANDOM]
- Win (4 ways per WIKIDEX): goal; opponent out of time (5 min each, online/room only); opponent unable to act = disqualified
  (no figure on the field able to move/attack, none deployable from the bench, no usable plate); forfeit. Turn 300 with no winner = both
  lose. CONFLICT: WIKIDEX calls the timeout win 'wait win'; Prima Games (via search) and the tutorial ('Not a Wait Victory')
  treat WaitWin as the no-actions win. Using the latter. [FANDOM][SEREBII][WIKIDEX]
- KO'd figures go to the P.C. (backup), max 2; a third one sent there pushes the oldest back to the bench. [SEREBII]
- A figure with every adjacent spot held by enemies is KO'd without battle. [BULBA TFG]
- Wait N: cannot move, attack, tag or use abilities for N turns (counts both players' turns); can still be
  targeted by plates; unlike conditions it survives bench/P.C. [BULBA]
- Special conditions (one at a time, new replaces old): Paralyzed, Poisoned (-20 white/gold), Asleep, Confused,
  Burned (para + -10), Frozen (asleep + all attacks Miss), Noxious (-40), Curse (removed from duel when KO'd). [BULBA][SEREBII]
- Tagging an adjacent ally wakes an asleep figure (also: attacking a sleeping enemy). [FANDOM]

- A figure that just left the P.C. must wait a turn before leaving the bench; forced returns to the bench: attacks (Dragon Tail),
  specific plates, or an ally KO'd taking its P.C. slot. Some figures cannot leave the bench normally (Dialga while others are
  there; Reshiram waits 9 turns). [WIKIDEX] Some attacks cost the opponent a turn (Hyper Beam). [WIKIDEX]
- Version changes that affect rules: plate cost cap 6→8 (4.0.0); Ultra Space (5.0.6); Mega Evolution revamped (6.0.0, details not
  found); Z-Moves (7.0.0, early look 6.2.9); gold attacks introduced in 1.0 (beat purple, can stun). Hyper-detail in `data/patches_serebii.json`
  and `data/version_history_rule_lines.json`. [SEREBII][BULBA]

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

## Cross-checks
- Serebii lists 594 figure ids; Bulbapedia has 567 pages (variants share pages). All sampled Serebii ids map to a Bulbapedia page;
  one possible gap: second Dawn Wings Necrozma (id 647). 2 MP/rarity mismatches seen (Audino, Weedle) = rarity naming/patch drift.
- `data/abilities.json`: 364 abilities (Serebii, v7.0.14+) with effect text and figure names.

## Not found / blocked
- Reddit wiki (r/pokemonduel guide/successors), pokemon.com strategy page, PokéCommunity, Smogon, Prima Games, GamerBraves: 403
  (anti-bot). Not bypassed. web.archive.org: tunnel fails/429 from this session (tried 3 times).
- kaeru.world 521; GitHub search not allowed in this session (bound to its repos).
- Exact tie/turn-timer details differ by version; Gym Cup/Queen's Cup/Team Match modes are in `raw/pages_wikitext.json` unparsed.
- 13 figures have wheels not summing to 96 (wiki typos or extra segments) and 14 attack rows lack a colour: need review.
- Orbs/"scramble" never appeared in any source: probably not part of Duel.
