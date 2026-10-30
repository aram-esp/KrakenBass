"""Compare Bulbapedia latest-version wheels with Serebii first table, by figure id."""
import json, re
bf = json.load(open('../data/figures.json'))
sf = json.load(open('../data/figures_serebii.json'))
def sig_b(f):
    labels = list(f['wheels'])
    if not labels: return None
    w = [s for s in f['wheels'][labels[0]] if s['kind'] == 'duelattack']
    return sorted((s['color'] or '?', s['prob'] or 0, s['power'] or 0) for s in w)
def sig_s(d):
    if not d.get('wheels'): return None
    w = d['wheels'][0]['moves']
    out = []
    for m in w:
        mm = re.match(r'\d+', m['damage']); dmg = int(mm.group()) if mm else 0
        out.append((m['color'], m['size'], dmg))
    return sorted(out)
byid = {}
for f in bf: byid.setdefault(f['id'], []).append(f)
same = diff = nob = 0; diffs = []
for sid, d in sf.items():
    sid = int(sid); cands = byid.get(sid, [])
    sb = sig_s(d)
    if not cands or sb is None: nob += 1; continue
    ok = any(sig_b(c) == sb for c in cands)
    if ok: same += 1
    else:
        diff += 1; diffs.append({'id': sid, 'slug': d['slug'], 'bulba': [c['title'] for c in cands], 'serebii': sb, 'bulba_sig': [sig_b(c) for c in cands]})
print('identical first wheel:', same, 'different:', diff, 'unmatched:', nob)
json.dump(diffs, open('../data/wheel_crosscheck_diffs.json', 'w'), ensure_ascii=False, indent=1)
for x in diffs[:6]: print(x['id'], x['slug'], '\n  S:', x['serebii'], '\n  B:', x['bulba_sig'][0])
