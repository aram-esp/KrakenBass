# KrakenBass

Sprites 2D de Pokémon descargados de [PokeAPI](https://pokeapi.co/) ([repo de sprites](https://github.com/PokeAPI/sprites)).

| Carpeta | Estilo | Tamaño | Cobertura |
|---|---|---|---|
| `sprites/default/` | Pixel art frontal (estilo Gen V) | 96×96 | #1–#1025 (todas las generaciones) |
| `sprites/bw/` | Carpeta `black-white` de PokeAPI | 96×96 | #1–#1025 (1012 son idénticos a `default/`) |
| `sprites/emerald/` | Pokémon Esmeralda (Gen III) | 64×64 | #1–#386 (PokeAPI no tiene más) |

Nombre de archivo: `NNNN-nombre.png` (número de Pokédex nacional, forma por defecto).

Para volver a descargar (se salta los que ya existen):

```bash
python3 download_sprites.py all   # o: default / emerald / bw
```
