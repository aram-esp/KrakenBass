"""Parse the rendered Plate (Duel) table (rowspan-aware) into data/plates.json."""
import json, re
from html.parser import HTMLParser

html = json.load(open('raw/plate_parse.json'))['parse']['text']

class T(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows = []; self.cur = None; self.cell = None; self.depth = 0
    def handle_starttag(self, tag, a):
        a = dict(a)
        if tag == 'table': self.depth += 1
        if self.depth != 1 and tag != 'table': pass
        if tag == 'tr' and self.depth == 1: self.cur = []
        if tag in ('td', 'th') and self.depth == 1 and self.cur is not None:
            self.cell = {'text': '', 'alts': [], 'rs': int(a.get('rowspan', 1)), 'cs': int(a.get('colspan', 1))}
        if tag == 'img' and self.cell is not None: self.cell['alts'].append(a.get('alt', ''))
        if tag == 'br' and self.cell is not None: self.cell['text'] += ' '
    def handle_endtag(self, tag):
        if tag == 'table': self.depth -= 1
        if tag in ('td', 'th') and self.cell is not None and self.cur is not None:
            self.cur.append(self.cell); self.cell = None
        if tag == 'tr' and self.cur is not None and self.depth == 1:
            self.rows.append(self.cur); self.cur = None
    def handle_data(self, d):
        if self.cell is not None: self.cell['text'] += d

p = T(); p.feed(html)
# build grid resolving rowspan/colspan
grid, pending = [], {}
for r in p.rows:
    row, col, it = [], 0, iter(r)
    while True:
        if col in pending:
            c, left = pending[col]
            row.append(c)
            if left <= 1: del pending[col]
            else: pending[col] = (c, left - 1)
            col += 1; continue
        c = next(it, None)
        if c is None: break
        for _ in range(c['cs']):
            row.append(c)
            if c['rs'] > 1: pending[col] = (c, c['rs'] - 1)
            col += 1
    grid.append(row)

def t(c): return re.sub(r'\s+', ' ', c['text']).strip()
plates = {}
for row in grid[1:]:
    if len(row) < 8 or not t(row[0]).isdigit(): continue
    pid = int(t(row[0]))
    rec = {'description': t(row[4]), 'cost': int(t(row[5])) if t(row[5]).isdigit() else None,
           'gems': int(t(row[6])) if t(row[6]).isdigit() else None, 'since_version': t(row[7]) or None}
    e = plates.setdefault(pid, {'id': pid, 'category': (row[1]['alts'] or [t(row[1])])[0].replace('Duel Plate', '').strip(),
                                'name': t(row[2]), 'rarity': (row[3]['alts'] or [t(row[3])])[0], 'variants': []})
    if rec not in e['variants']: e['variants'].append(rec)
out = [plates[k] for k in sorted(plates)]
json.dump(out, open('../data/plates.json', 'w'), ensure_ascii=False, indent=1)
from collections import Counter
print(len(out), 'plates', Counter(p['category'] for p in out), Counter(p['rarity'] for p in out))
ids = [p['id'] for p in out]; print('id range', min(ids), max(ids), 'gaps', sorted(set(range(1, max(ids)+1)) - set(ids)))
for q in (out[0], out[15], out[-1]): print(json.dumps(q, ensure_ascii=False))
