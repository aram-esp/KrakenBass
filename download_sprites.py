"""Descarga sprites 2D (pixel art) de todos los Pokémon desde PokeAPI.

Sets:
  default  -> sprites frontales 96x96 (estilo Gen V pixel art), cubren #1-#1025
  emerald  -> sprites de Pokémon Esmeralda 64x64, solo existen para #1-#386
  bw       -> carpeta black-white de PokeAPI 96x96 (#650+ son los mismos que default)

Uso: python download_sprites.py [default|emerald|bw|all]
"""
import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

API = "https://pokeapi.co/api/v2/pokemon-species?limit=100000"
RAW = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon"
SETS = {
    "default": (RAW, None),
    "emerald": (RAW + "/versions/generation-iii/emerald", 386),
    "bw": (RAW + "/versions/generation-v/black-white", None),
}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "KrakenBass-sprites/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def species():
    data = json.loads(fetch(API))
    out = []
    for s in data["results"]:
        dex = int(s["url"].rstrip("/").split("/")[-1])
        out.append((dex, s["name"]))
    return sorted(out)


def download(name, base, max_dex, entries):
    folder = os.path.join("sprites", name)
    os.makedirs(folder, exist_ok=True)
    todo = [(d, n) for d, n in entries if max_dex is None or d <= max_dex]

    def one(entry):
        dex, poke = entry
        path = os.path.join(folder, f"{dex:04d}-{poke}.png")
        if os.path.exists(path):
            return None
        try:
            png = fetch(f"{base}/{dex}.png")
        except Exception as e:
            return f"{dex} {poke}: {e}"
        with open(path, "wb") as f:
            f.write(png)
        return None

    with ThreadPoolExecutor(16) as pool:
        errors = [e for e in pool.map(one, todo) if e]
    print(f"{name}: {len(todo) - len(errors)}/{len(todo)} sprites")
    for e in errors:
        print("  fallo:", e)


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    entries = species()
    for name, (base, max_dex) in SETS.items():
        if which in (name, "all"):
            download(name, base, max_dex, entries)


if __name__ == "__main__":
    main()
