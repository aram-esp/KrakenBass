"""Build data/evolutions.json: for each Duel figure, the figures it can evolve into.

Evolution chains come from PokeAPI (pokemon-species -> evolution-chain). A species' next stage maps to the Duel
figure of that species released earliest (lowest version; ties: lowest figure id). Form figures (Mega, Alolan,
Primal, Rotom forms, Kyurem/Necrozma forms) neither evolve nor are evolution targets here.

Run from duel/:  python3 tools/build_evolutions.py
"""
import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = {"User-Agent": "KrakenBass-duel/1.0"}
FORM = re.compile(r"^(Mega|Alolan|Primal|Black|White|Dawn|Dusk|Ultra|Heat|Wash|Frost|Fan|Mow) ")


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return json.load(r)


def slug(name):
    return re.sub(r"[^a-z0-9-]", "", name.lower().replace(" ", "-").replace("♂", "-m").replace("♀", "-f").replace(".", ""))


def version_key(v):
    return tuple(int(x) for x in v.split("."))


def main():
    figs = [f for f in json.load(open(ROOT / "data" / "figures.json")) if not FORM.match(f["name"])]
    species = sorted({slug(f["name"]) for f in figs})
    with ThreadPoolExecutor(12) as ex:
        chain_urls = sorted({u for u in ex.map(lambda s: get(f"https://pokeapi.co/api/v2/pokemon-species/{s}")["evolution_chain"]["url"], species)})
    nxt = {}

    def walk(c):
        for e in c["evolves_to"]:
            nxt.setdefault(c["species"]["name"], []).append(e["species"]["name"])
            walk(e)

    with ThreadPoolExecutor(12) as ex:
        for ch in ex.map(get, chain_urls):
            walk(ch["chain"])

    first_figure = {}
    for f in sorted(figs, key=lambda f: (version_key(f["version"]), f["id"])):
        first_figure.setdefault(slug(f["name"]), f["id"])
    out = {}
    for f in figs:
        targets = [first_figure[s] for s in nxt.get(slug(f["name"]), []) if s in first_figure]
        if targets:
            out[str(f["id"])] = targets
    data = {
        "_source": "Evolution chains from PokeAPI (pokeapi.co); each next species maps to its earliest Duel figure. "
                   "Built by tools/build_evolutions.py.",
        "evolves": out,
    }
    json.dump(data, open(ROOT / "data" / "evolutions.json", "w"), indent=1, ensure_ascii=False)
    print(f"{len(species)} species, {len(chain_urls)} chains, {len(out)} figures can evolve")


if __name__ == "__main__":
    main()
