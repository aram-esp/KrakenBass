"""Assemble publish/index.html: one self-contained page (template + minified bundle + trimmed data).
Run from duel/:  npx esbuild web/src/main.ts --bundle --minify --format=iife --outfile=publish/app.min.js && python3 publish/build.py
"""
import base64
import json
from pathlib import Path

def trim(figs):
    out = []
    for f in figs:
        w = list(f['wheels'].values())
        first = [{k: t[k] for k in ('kind', 'color', 'name', 'power', 'prob', 'stars')} for t in (w[0] if w else []) if t['kind'] == 'duelattack']
        out.append({'title': f['title'], 'id': f['id'], 'name': f['name'], 'type': f['type'], 'mp': f['mp'], 'rarity': f['rarity'], 'wheels': {'v': first}})
    return json.dumps(out, separators=(',', ':'), ensure_ascii=False)

esc = lambda s: s.replace('</', '<\\/')
t = open('publish/template.html').read()
board = json.dumps(json.load(open('data/board.json')), separators=(',', ':'))
figs = trim(json.load(open('data/figures.json')))
app = open('publish/app.min.js').read()
# Sprites as data: URIs (the published page cannot load files next to it). Only ids present in the data.
ids = {str(f['id']) for f in json.load(open('data/figures.json'))}
sprites = {p.stem: 'data:image/png;base64,' + base64.b64encode(p.read_bytes()).decode()
           for p in sorted(Path('assets/sprites').glob('*.png')) if p.stem in ids}
sprites_json = json.dumps(sprites, separators=(',', ':'))
out = t.replace('__BOARD__', esc(board)).replace('__FIGURES__', esc(figs)).replace('__SPRITES__', esc(sprites_json)).replace('<script>__APP__</script>', '<script>' + esc(app) + '</script>')
open('publish/index.html', 'w').write(out)
print(f'publish/index.html {len(out) // 1024} KB, {len(sprites)} sprites')
