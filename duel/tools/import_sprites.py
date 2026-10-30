"""Link your own sprite files to figures so the 2D view can use them.

The 2D view loads  assets/sprites/<figure id>.png  (see data/figures.json, field `id`).
Figure ids are NOT National Dex numbers, so files have to be matched by name.

  python3 tools/import_sprites.py SRC_DIR              # files named like  pikachu.png, mr-mime.png
  python3 tools/import_sprites.py SRC_DIR --map m.csv  # CSV with columns: file,name  (e.g. 25.png,Pikachu)
  python3 tools/import_sprites.py SRC_DIR --dry-run

Every figure whose name matches gets a copy, so Pikachu variants share one image.
This tool only copies files you already have; it downloads nothing. assets/sprites/ is git-ignored.
"""
import argparse, csv, json, re, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
slug = lambda s: re.sub(r'[^a-z0-9]+', '', s.lower())

ap = argparse.ArgumentParser()
ap.add_argument('src', type=Path)
ap.add_argument('--map', type=Path, help='CSV with columns file,name')
ap.add_argument('--out', type=Path, default=ROOT / 'assets' / 'sprites')
ap.add_argument('--dry-run', action='store_true')
a = ap.parse_args()

figs = json.load(open(ROOT / 'data' / 'figures.json'))
by_name = {}
for f in figs:
    by_name.setdefault(slug(f['name']), []).append(f)

names = {}
if a.map:
    for row in csv.DictReader(open(a.map, newline='')):
        names[row['file'].strip()] = row['name'].strip()

matched, unmatched, figures_hit = 0, [], set()
for p in sorted(a.src.iterdir()):
    if p.suffix.lower() not in ('.png',):
        continue
    key = slug(names.get(p.name, p.stem))
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
