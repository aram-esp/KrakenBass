"""Parse Serebii figure list, abilities list and patch notes; cross-check figures against Bulbapedia."""
import json, re
RAW = lambda n: open(f'raw/web/serebii_{n}.txt', encoding='utf-8', errors='replace').read()

# ---- figures cross-check
t = RAW('figures')
lines = [l.strip(' |').strip() for l in t.split('\n')]
fig, i = {}, 0
while i < len(lines):
    m = re.match(r'^ID - (\d+)$', lines[i])
    if m and i + 5 < len(lines):
        pid = int(m.group(1)); nm, rar, mp, mats = lines[i+2], lines[i+3], lines[i+4], lines[i+5]
        if mp.isdigit(): fig[pid] = {'name': nm, 'rarity': rar, 'mp': int(mp), 'mats': int(mats.replace(',', '')) if mats.replace(',', '').isdigit() else None}
        i += 6
    else: i += 1
bf = json.load(open('../data/figures.json'))
byid = {}
for f in bf:
    if f.get('id') is not None: byid.setdefault(f['id'], []).append(f)
R = {'C': 'Common', 'UC': 'Uncommon', 'R': 'Rare', 'EX': 'EX', 'UX': 'UX'}
diff = []
for pid, s in fig.items():
    b = byid.get(pid)
    if not b: diff.append((pid, s['name'], 'missing in bulbapedia')); continue
    b = b[0]
    if b['name'] != s['name'] and s['name'] not in b['title']: diff.append((pid, s['name'], f"name {b['name']}"))
    if b['mp'] != s['mp']: diff.append((pid, s['name'], f"mp bulba={b['mp']} serebii={s['mp']}"))
    if b['rarity'] != R.get(s['rarity'], s['rarity']): diff.append((pid, s['name'], f"rarity bulba={b['rarity']} serebii={s['rarity']}"))
print('serebii figures', len(fig), 'bulbapedia ids', len(byid), 'ids only in bulba', len(set(byid) - set(fig)), 'diffs', len(diff))
for d in diff[:25]: print('  ', d)
json.dump(fig, open('../data/figures_serebii_index.json', 'w'), ensure_ascii=False, indent=1)

# ---- abilities
t = RAW('abilities')
body = t[t.find('Abilities Listings'):]
body = body[:body.find('Game Names')]
ls = [l.strip(' |').strip() for l in body.split('\n')]
ab, cur = [], None
i = 3
while i < len(ls):
    l = ls[i]
    if not l: i += 1; continue
    # pattern: name, effect(s...), [figures]
    name = l; i += 1; eff = []
    while i < len(ls) and not (ls[i].startswith('[') and ls[i].endswith(']')):
        if ls[i]: eff.append(ls[i])
        i += 1
    figs = []
    while i < len(ls) and ls[i].startswith('['):
        figs += re.findall(r'\[([^\]]+)\]', ls[i]); i += 1
    ab.append({'name': name, 'effect': ' '.join(eff), 'figures': figs})
json.dump(ab, open('../data/abilities.json', 'w'), ensure_ascii=False, indent=1)
print('abilities', len(ab), ab[1], ab[-1]['name'])

# ---- patches
t = RAW('patch'); body = t[t.find('Version 1.0'):]; body = body[:body.find('Game Names')]
parts = re.split(r'\n\s*\|?\s*(Version [\d\.]+[^\n]*)\n', '\n' + body)
patches = [{'version': parts[k].strip(' |'), 'text': re.sub(r'\n\s*\n+', '\n', parts[k+1]).strip()} for k in range(1, len(parts) - 1, 2)]
json.dump(patches, open('../data/patches_serebii.json', 'w'), ensure_ascii=False, indent=1)
print('patches', len(patches), [p['version'] for p in patches][:6], '...', patches[-1]['version'])
