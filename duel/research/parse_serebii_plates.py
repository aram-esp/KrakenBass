"""Parse Serebii's plate listing into data/plates_serebii.json and merge with Bulbapedia data/plates.json."""
import json, re
t = open('raw/web/serebii_plates.txt', encoding='utf-8', errors='replace').read()
body = t[t.find('| ID No.'):]
lines = [l.strip() for l in body.split('\n')]
rows, i = [], 0
while i < len(lines):
    m = re.match(r'^\|?\s*ID-(\d+)\s*$', lines[i])
    if m:
        f = [re.sub(r'^\|\s*', '', x).strip() for x in lines[i+1:i+6]]
        # f: icon, title, rarity, cost, effect (effect may span following lines until next ID or end marker)
        j = i + 6
        eff = f[4]
        while j < len(lines) and not re.match(r'^\|?\s*ID-\d+\s*$', lines[j]) and lines[j].startswith(('|',)) is False and lines[j]:
            eff += ' ' + lines[j]; j += 1
        icon = re.sub(r'[\[\]]', '', f[0])
        rows.append({'id': int(m.group(1)), 'icon': icon, 'name': f[1], 'rarity': f[2],
                     'cost': int(f[3]) if f[3].isdigit() else None, 'effect': eff.strip()})
        i = j
    else:
        i += 1
json.dump(rows, open('../data/plates_serebii.json', 'w'), ensure_ascii=False, indent=1)
ids = [r['id'] for r in rows]
print(len(rows), 'serebii plates; id range', min(ids), max(ids), 'dups', len(ids) - len(set(ids)))
bulba = {p['id']: p for p in json.load(open('../data/plates.json'))}
only_s = sorted(set(ids) - set(bulba)); only_b = sorted(set(bulba) - set(ids))
print('only in serebii:', len(only_s), 'only in bulbapedia:', len(only_b), only_b[:20])
from collections import Counter
print(Counter(r['icon'] for r in rows)); print(Counter(r['rarity'] for r in rows)); print(Counter(r['cost'] for r in rows))
for r in rows[-3:]: print(r)
