"""Descarga sprites 2D (pixel art) de Pokémon desde PokeAPI a assets/pokeapi/<set>/.

Sets:
  bw       -> carpeta black-white de PokeAPI 96x96, #1-#1025 más las formas (Megas, Alola,
              Rotom, Kyurem, Necrozma...) que existan en esa carpeta (ids 10001+)
  default  -> sprites frontales 96x96 (estilo Gen V pixel art), #1-#1025
  emerald  -> sprites de Pokémon Esmeralda 64x64, solo existen para #1-#386

Nombre de archivo: <número>-<nombre en PokeAPI>.png, por ejemplo 0025-pikachu.png o
10034-charizard-mega-x.png. Los que ya existen no se vuelven a descargar.

Uso: python3 tools/download_sprites.py [bw|default|emerald|all]
"""
import json
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "pokeapi"
API = "https://pokeapi.co/api/v2"
RAW = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon"
# set -> (url base, último número de especie, incluir formas)
SETS = {
    "bw": (RAW + "/versions/generation-v/black-white", None, True),
    "default": (RAW, None, False),
    "emerald": (RAW + "/versions/generation-iii/emerald", 386, False),
}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "KrakenBass-sprites/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def listing(kind):
    data = json.loads(fetch(f"{API}/{kind}?limit=100000"))
    out = []
    for s in data["results"]:
        num = int(s["url"].rstrip("/").split("/")[-1])
        out.append((num, s["name"]))
    return sorted(out)


def download(name, base, max_dex, entries):
    folder = OUT / name
    folder.mkdir(parents=True, exist_ok=True)
    todo = [(d, n) for d, n in entries if max_dex is None or d <= max_dex]

    def one(entry):
        num, poke = entry
        path = folder / f"{num:04d}-{poke}.png"
        if path.exists():
            return "ok"
        for attempt in range(3):
            try:
                png = fetch(f"{base}/{num}.png")
                break
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    return "404"
                err = e
            except Exception as e:
                err = e
        else:
            return f"{num} {poke}: {err}"
        path.write_bytes(png)
        return "ok"

    with ThreadPoolExecutor(16) as pool:
        results = list(pool.map(one, todo))
    ok = results.count("ok")
    missing = results.count("404")
    errors = [r for r in results if r not in ("ok", "404")]
    print(f"{name}: {ok}/{len(todo)} sprites, {missing} no existen en PokeAPI")
    for e in errors:
        print("  fallo:", e)


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    species = listing("pokemon-species")
    forms = None
    for name, (base, max_dex, with_forms) in SETS.items():
        if which not in (name, "all"):
            continue
        entries = species
        if with_forms:
            if forms is None:
                forms = [(n, p) for n, p in listing("pokemon") if n > 10000]
            entries = species + forms
        download(name, base, max_dex, entries)


if __name__ == "__main__":
    main()
