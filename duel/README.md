# Duel engine (from scratch)

Pure TypeScript rules engine, no dependencies. Needs Node >= 22.6 (runs `.ts` directly).

```bash
npm test
```

## Status
Skeleton only. It models turns, movement points, goals, roulette battles,
colour matchups, encirclement KO, no-legal-moves loss and a turn limit.

**Not the real game yet.** The board in the tests is a toy 5-node line, and every
number in `src/rules.config.ts` is an unverified placeholder. Still missing:
the real 26-point map, wheel/damage tables, plates and energy, abilities,
orbs/scramble, fusion/evolution. These need primary sources
(Bulbapedia, r/pokemonduel wiki), which are blocked in this session.

Use original names and art; the mechanics are the only thing being reproduced.
