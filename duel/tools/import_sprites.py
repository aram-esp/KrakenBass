"""Link your own sprite files to figures so the 2D view can use them.

The 2D view loads  assets/sprites/<figure id>.png  (see data/figures.json, field `id`).
Figure ids are NOT National Dex numbers, so files have to be matched by name.

  python3 tools/import_sprites.py SRC_DIR              # files named like  pikachu.png, mr-mime.png
  python3 tools/import_sprites.py SRC_DIR --map m.csv  # CSV with columns: file,name  (e.g. 25.png,Pikachu)
  python3 tools/import_sprites.py SRC_DIR --dry-run
  python3 tools/import_sprites.py assets/pokeapi/bw --pokeapi   # files from tools/download_sprites.py

Every figure whose name matches gets a copy, so Pikachu variants share one image.
This tool only copies files you already have; it downloads nothing (tools/download_sprites.py does).
"""
import argparse, csv, json, re, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
slug = lambda s: re.sub(r'[^a-z0-9]+', '', s.lower())

# Duel figure name -> PokeAPI pokemon name, for forms PokeAPI writes the other way round.
POKEAPI_FORMS = [
    (r'^Mega (.+?)( [XY])?$', lambda m: m[1] + '-mega' + (m[2] or '').lower().replace(' ', '-')),
    (r'^Alolan (.+)$', lambda m: m[1] + '-alola'),
    (r'^Primal (.+)$', lambda m: m[1] + '-primal'),
    (r'^(Heat|Wash|Frost|Fan|Mow) Rotom$', lambda m: 'rotom-' + m[1]),
    (r'^(Black|White) Kyurem$', lambda m: 'kyurem-' + m[1]),
    (r'^(Dawn|Dusk) \w+ Necrozma$', lambda m: 'necrozma-' + m[1]),
    (r'^Ultra Necrozma$', lambda m: 'necrozma-ultra'),
]

def pokeapi_name(name):
    name = name.replace('♂', '-m').replace('♀', '-f')
    for pattern, fn in POKEAPI_FORMS:
        m = re.match(pattern, name)
        if m:
            return fn(m)
    return name

ap = argparse.ArgumentParser()
ap.add_argument('src', type=Path)
ap.add_argument('--map', type=Path, help='CSV with columns file,name')
ap.add_argument('--out', type=Path, default=ROOT / 'assets' / 'sprites')
ap.add_argument('--dry-run', action='store_true')
ap.add_argument('--pokeapi', action='store_true', help='files named <number>-<pokeapi name>.png')
a = ap.parse_args()

figs = json.load(open(ROOT / 'data' / 'figures.json'))
by_name = {}
for f in figs:
    by_name.setdefault(slug(pokeapi_name(f['name']) if a.pokeapi else f['name']), []).append(f)

names = {}
if a.map:
    for row in csv.DictReader(open(a.map, newline='')):
        names[row['file'].strip()] = row['name'].strip()

matched, unmatched, figures_hit = 0, [], set()
for p in sorted(a.src.iterdir()):
    if p.suffix.lower() not in ('.png',):
        continue
    stem = re.sub(r'^\d+-', '', p.stem) if a.pokeapi else p.stem
    key = slug(names.get(p.name, stem))
    targets = by_name.get(key, [])
    if not targets:
        unmatched.append(p.name)
        continue
    matched += 1
    for f in targets:
        figures_hit.add(f['id'])
        if not a.dry_run:
            a.out.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(p, a.out / f"{f['id']}.png")

print(f'{matched} files matched, {len(figures_hit)} figures covered of {len(figs)}; {len(unmatched)} files unmatched')
if unmatched:
    print('unmatched (first 20):', ', '.join(unmatched[:20]))
if a.dry_run:
    print('dry run: nothing copied')
