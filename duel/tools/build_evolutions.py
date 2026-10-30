"""Build data/evolutions.json: for each Duel figure, the figures it can evolve into.

Evolution chains come from PokeAPI (pokemon-species -> evolution-chain). A species' next stage maps to the Duel
figure of that species released earliest (lowest version; ties: lowest figure id). Form figures (Mega, Alolan,
Primal, Rotom forms, Kyurem/Necrozma forms) neither evolve nor are evolution targets here.

Run from duel/:  python3 tools/build_evolutions.py
"""
import json
import re
import shutil
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = {"User-Agent": "KrakenBass-duel/1.0"}
LAUNCH = "1.0.0"  # game version whose figures start the invented chains (src/data.ts GAME_VERSION)
# Species that only evolve from a regional form (Galarian/Hisuian/Paldean), which no Duel figure here is.
REGIONAL_ONLY = {"perrserker", "sirfetchd", "mr-rime", "obstagoon", "runerigus", "cursola", "overqwil", "sneasler", "clodsire"}
FORM = re.compile(r"^(Mega|Alolan|Primal|Black|White|Dawn|Dusk|Ultra|Heat|Wash|Frost|Fan|Mow) ")


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return json.load(r)


def slug(name):
    return re.sub(r"[^a-z0-9-]", "", name.lower().replace(" ", "-").replace("♂", "-m").replace("♀", "-f").replace(".", ""))


def version_key(v):
    return tuple(int(x) for x in v.split("."))


def main():
    all_figs = json.load(open(ROOT / "data" / "figures.json"))
    figs = [f for f in all_figs if not FORM.match(f["name"])]
    species = sorted({slug(f["name"]) for f in figs})
    with ThreadPoolExecutor(12) as ex:
        chain_urls = sorted({u for u in ex.map(lambda s: get(f"https://pokeapi.co/api/v2/pokemon-species/{s}")["evolution_chain"]["url"], species)})
    nxt = {}

    def walk(c):
        for e in c["evolves_to"]:
            if e["species"]["name"] not in REGIONAL_ONLY:
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
        # Ids as strings everywhere: mixing 633 and "633" listed the same evolution twice.
        targets = [str(first_figure[s]) for s in nxt.get(slug(f["name"]), []) if s in first_figure]
        if targets:
            out[str(f["id"])] = targets

    # Invented figures (user, 2026-10-30): from the launch figures, follow every chain; a next stage with no Duel
    # figure becomes an invented one ("x-<species>") that keeps evolving along its chain.
    by_id = {str(f["id"]): f for f in figs}
    invented = {}
    queue = [str(f["id"]) for f in figs if f["version"] == LAUNCH]
    seen = set(queue)
    while queue:
        cur = queue.pop()
        sp = invented[cur]["species"] if cur in invented else slug(by_id[cur]["name"])
        for nsp in nxt.get(sp, []):
            if nsp in first_figure:
                to = str(first_figure[nsp])
            else:
                to = f"x-{nsp}"
                invented.setdefault(to, {"species": nsp, "from": cur})
            if to not in out.get(cur, []):
                out.setdefault(cur, []).append(to)
            if to not in seen:
                seen.add(to)
                queue.append(to)

    def describe(item):
        to, info = item
        sp = get(f"https://pokeapi.co/api/v2/pokemon-species/{info['species']}")
        name = next(n["name"] for n in sp["names"] if n["language"]["name"] == "en")
        var = next(v["pokemon"] for v in sp["varieties"] if v["is_default"])
        pk = get(var["url"])
        types = [t["type"]["name"].capitalize() for t in sorted(pk["types"], key=lambda t: t["slot"])]
        return to, {**info, "name": name, "type": types[0], "type2": types[1] if len(types) > 1 else None,
                    "sprite": f"{pk['id']:04d}-{pk['name']}.png"}

    with ThreadPoolExecutor(12) as ex:
        invented = dict(ex.map(describe, sorted(invented.items())))
    data = {
        "_source": "Evolution chains, names and types from PokeAPI (pokeapi.co); each next species maps to its earliest "
                   "Duel figure. 'invented': stages with no Duel figure (wheel = the previous stage's +10 damage / +1 star, "
                   "built in src/data.ts). Built by tools/build_evolutions.py.",
        "evolves": out,
        "invented": invented,
    }
    json.dump(data, open(ROOT / "data" / "evolutions.json", "w"), indent=1, ensure_ascii=False)
    # Sprites for the invented figures, from the PokeAPI black-white download.
    for to, info in invented.items():
        src = ROOT / "assets" / "pokeapi" / "bw" / info["sprite"]
        if not src.exists():  # the download names some by species (0678-meowstic.png, not -male)
            src = next(iter(sorted((ROOT / "assets" / "pokeapi" / "bw").glob(info["sprite"][:4] + "-*.png"))), src)
        if src.exists():
            shutil.copyfile(src, ROOT / "assets" / "sprites" / f"{to}.png")
        else:
            print("no sprite for", to, info["sprite"])
    print(f"{len(species)} species, {len(chain_urls)} chains, {len(out)} figures can evolve, {len(invented)} invented")


if __name__ == "__main__":
    main()
