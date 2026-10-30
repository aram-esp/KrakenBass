# KrakenBass

Repositorio del proyecto **Duel**: un juego de tablero desde cero al estilo de Pokémon Duel. Todo está en [`duel/`](duel/).

- [`duel/README.md`](duel/README.md): cómo instalar, probar y jugar.
- [`duel/docs/NOTES.md`](duel/docs/NOTES.md): estado del proyecto, decisiones y próximos pasos.
- [`duel/docs/diseno-pokemon-duel.md`](duel/docs/diseno-pokemon-duel.md): resumen en español de las mecánicas de Pokémon Duel.
- [`duel/research/FINDINGS.md`](duel/research/FINDINGS.md): investigación detallada con fuentes.

## Sprites

La vista 2D usa los sprites de la carpeta *black-white* de [PokeAPI](https://github.com/PokeAPI/sprites) (96×96).

| Carpeta | Contenido |
|---|---|
| `duel/assets/sprites/` | Un PNG por figura (`<id de figura>.png`): lo que carga el juego |
| `duel/assets/pokeapi/bw/` | Descarga original: #1–#1025 y formas (Megas, Alola, Rotom…) |
| `duel/assets/pokeapi/default/` | Sprites por defecto de PokeAPI, #1–#1025 (no se usan) |
| `duel/assets/pokeapi/emerald/` | Pokémon Esmeralda, #1–#386 (no se usan) |

Para regenerarlos:

```bash
cd duel
python3 tools/download_sprites.py bw
python3 tools/import_sprites.py assets/pokeapi/bw --pokeapi
```

Pokémon y sus sprites son de Nintendo, Game Freak y The Pokémon Company.
