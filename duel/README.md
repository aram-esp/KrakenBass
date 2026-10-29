# Duel engine (from scratch)

Pure TypeScript rules engine, no dependencies. Needs Node >= 22.6 (runs `.ts` directly).

```bash
npm test
```

## Sources
Bulbapedia (via its MediaWiki API): "Pokémon Duel" and "Pokémon Trading Figure Game"
(Mechanics). Bulbapedia says Duel used rules almost identical to the physical Trading
Figure Game. The Bulbapedia web pages sit behind a Cloudflare challenge; use `api.php`
with an identifying User-Agent.

## Implemented (from sources)
- Win by stepping onto the opponent's goal.
- Move one adjacent step per MP, through empty nodes only.
- Battle when figures are on adjacent spots; both spin their wheel.
- Colours: blue beats all (dodge); purple beats white and fewer-star purples; white beats
  lower whites; red (miss) loses to everything; ties do nothing.
- A figure with every adjacent spot held by enemies is KO'd without battle.

## Still UNVERIFIED / open
- Real board map (26 points per one search summary) and wheel/damage tables.
- Where gold sits (Duel-only colour; TFG never shipped it).
- Whether purple/gold wins KO like white (they apply effects / special conditions).
- Which adjacent enemy is fought when there are several; move/deploy turn structure.
- Pokémon Center / bench return rule (TFG: KO'd figures go to the Center and only
  return to the bench when another figure is sent there; wording is ambiguous).
- Turn limit, timers, plates (the Bulbapedia plate list was empty), abilities,
  orbs/scramble, special conditions, Mega Evolution/Wait timers.
- Progression facts found: fusion/levels (max 5, Carmonite to 10), rarity
  Common/Uncommon/Rare/EX/UX, deck of 6 figures, +20 white/gold damage in gym cups.

Use original names and art; only the mechanics are being reproduced.
