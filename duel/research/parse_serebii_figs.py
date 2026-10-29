"""Parse Serebii per-figure pages (raw/web/serebii_figs/*.html) into data/figures_serebii.json."""
import json, re, glob, os
from html.parser import HTMLParser

class T(HTMLParser):
    def __init__(s):
        super().__init__(); s.tables = []; s.stack = []; s.row = None; s.cell = None; s.text = []
    def handle_starttag(s, tag, a):
        if tag == 'table': s.stack.append([]); 
        elif tag == 'tr' and s.stack: s.row = []
        elif tag in ('td', 'th') and s.row is not None: s.cell = ''
        elif tag == 'br' and s.cell is not None: s.cell += ' '
    def handle_endtag(s, tag):
        if tag in ('td', 'th') and s.cell is not None and s.row is not None:
            s.row.append(re.sub(r'\s+', ' ', s.cell).strip()); s.cell = None
        elif tag == 'tr' and s.row is not None and s.stack:
            s.stack[-1].append(s.row); s.row = None
        elif tag == 'table' and s.stack:
            s.tables.append(s.stack.pop())
    def handle_data(s, d):
        if s.cell is not None: s.cell += d
        s.text.append(d)

def parse(path):
    p = T(); p.feed(open(path, encoding='utf-8', errors='replace').read())
    txt = ' '.join(p.text)
    out = {}
    flat = re.sub(r'\s+', ' ', txt)
    m = re.search(r'Movement\s*:\s*(\S+)\s+Rarity\s*:\s*(\S+)\s+Type\s*:\s*(.*?)\s+Special Ability\s*:\s*(.*?)\s+Move List', flat)
    if m: out.update(movement=m.group(1), rarity=m.group(2), type=m.group(3), ability=m.group(4))
    wheels = []
    for tb in p.tables:
        hdr = [r for r in tb if r and r[0].startswith('Base Wheel Size')]
        if not hdr: continue
        moves, z = [], None
        for r in tb:
            if not r or r[0].startswith('Base Wheel Size'): continue
            if len(r) >= 5 and re.fullmatch(r'\d+', r[0]):
                if 'Z-Move' in r[2]:
                    z = {'name': r[1], 'color': r[2], 'notes': r[3], 'damage': r[4]}
                else:
                    moves.append({'size': int(r[0]), 'name': r[1], 'color': r[2].lower(), 'notes': r[3], 'damage': r[4]})
        wheels.append({'moves': moves, 'z': z})
    out['wheels'] = wheels
    return out

if __name__ == '__main__':
    res = {}
    for f in sorted(glob.glob('raw/web/serebii_figs/*.html'), key=lambda x: int(re.match(r'(\d+)-', os.path.basename(x)).group(1))):
        n = os.path.basename(f)[:-5]; fid = int(n.split('-')[0])
        try: d = parse(f)
        except Exception as e: d = {'error': str(e)}
        d['slug'] = n; res[fid] = d
    json.dump(res, open('../data/figures_serebii.json', 'w'), ensure_ascii=False, indent=1)
    bad = [k for k, v in res.items() if not v.get('wheels')]
    sums = [sum(m['size'] for m in v['wheels'][0]['moves']) for v in res.values() if v.get('wheels')]
    from collections import Counter
    print(len(res), 'parsed; no wheel:', bad[:15], 'first-wheel sums', Counter(sums).most_common(6))
