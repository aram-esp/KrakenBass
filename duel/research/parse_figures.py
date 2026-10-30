"""Parse Bulbapedia Duel figure wikitext (research/raw/figures_wikitext.json) into data/figures.json."""
import json, re, sys

def split_templates(text):
    """Yield (name, params_dict) for top-level {{...}} templates, tracking nested {{ }} and [[ ]]."""
    out, i, n = [], 0, len(text)
    while i < n - 1:
        if text[i:i+2] == '{{':
            depth, j = 1, i + 2
            while j < n - 1 and depth:
                if text[j:j+2] == '{{': depth += 1; j += 2
                elif text[j:j+2] == '}}': depth -= 1; j += 2
                else: j += 1
            out.append(text[i+2:j-2]); i = j
        else:
            i += 1
    return out

def split_params(body):
    parts, cur, d, b = [], '', 0, 0
    i = 0
    while i < len(body):
        two = body[i:i+2]
        if two == '{{': d += 1; cur += two; i += 2; continue
        if two == '}}': d -= 1; cur += two; i += 2; continue
        if two == '[[': b += 1; cur += two; i += 2; continue
        if two == ']]': b -= 1; cur += two; i += 2; continue
        if body[i] == '|' and d == 0 and b == 0: parts.append(cur); cur = ''
        else: cur += body[i]
        i += 1
    parts.append(cur)
    name = parts[0].strip().lower()
    params, pos = {}, []
    for p in parts[1:]:
        if '=' in p and re.match(r'^\s*[\w\-]+\s*=', p):
            k, v = p.split('=', 1); params[k.strip()] = v.strip()
        else: pos.append(p.strip())
    return name, params, pos

def clean(s):
    s = re.sub(r'\{\{(?:DL|TFG|m|p|tb|OBP|type)\|([^{}|]*\|)?([^{}|]*)(\|[^{}]*)?\}\}', lambda m: m.group(2), s or '')
    s = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]*)\]\]', r'\1', s)
    s = re.sub(r"'''?", '', s)
    return s.strip()

def num(v):
    if v is None: return None
    m = re.search(r'-?\d+', v.replace(',', ''))
    return int(m.group()) if m else None

def parse_figure(title, text):
    f = {'title': title}
    for body in split_templates(text):
        name, p, pos = split_params(body)
        if name == 'duelinfobox/header':
            f.update(name=p.get('name'), form=p.get('form'), type=p.get('type'), mp=num(p.get('mp')), rarity=p.get('rarity'),
                     evostage=num(p.get('evostage')), jname=p.get('jname'), type2=p.get('type2'))
        elif name == 'duelinfobox/figure':
            f.update(id=num(p.get('id')), version=p.get('version'), league=p.get('league'),
                     gems=num(p.get('gems')), mats=num(p.get('mats')), locked=p.get('locked'), special=clean(p.get('special', '')) or None)
    f['abilities'] = {}
    ma = re.search(r'==\s*Abilit(?:y|ies)\s*==(.*?)(?=\n==[^=]|\Z)', text, re.S)
    if ma:
        parts = re.split(r'\n===\s*(.*?)\s*===\s*\n', '\n' + ma.group(1))
        pairs = [('default', parts[0])] + [(parts[i], parts[i+1]) for i in range(1, len(parts) - 1, 2)]
        for label, seg in pairs:
            lst = []
            for body in split_templates(seg):
                name, p, pos = split_params(body)
                if name == 'duelability':
                    lst.append({'type': p.get('type'), 'name': clean(p.get('name')), 'effect': clean(p.get('effect', '')) or None})
            if lst: f['abilities'][label] = lst
    # wheels: sections "===Version X===" under "==Data Disk=="
    m = re.search(r'==\s*(?:Data Disk|Attack wheel)\s*==(.*?)(?=\n==[^=]|\Z)', text, re.S)
    wheels = {}
    if m:
        block = m.group(1)
        parts = re.split(r'\n===\s*(.*?)\s*===\s*\n', '\n' + block)
        pairs = [('default', parts[0])] + [(parts[i], parts[i+1]) for i in range(1, len(parts) - 1, 2)]
        for label, seg in pairs:
            segs = []
            for body in split_templates(seg):
                name, p, pos = split_params(body)
                if name in ('duelattack', 'duelzmove', 'duelmegamove', 'duelattack/mega'):
                    segs.append({'kind': name, 'color': (p.get('movecol') or '').lower().replace('whie', 'white') or None, 'name': clean(p.get('name')),
                                 'power': num(p.get('power')), 'prob': num(p.get('prob')),
                                 'effect': clean(p.get('effect', '')) or None,
                                 'stars': num(p.get('stars') or p.get('star')), 'type': p.get('type')})
            if segs: wheels[label] = segs
    f['wheels'] = wheels
    ms = re.search(r'==\s*Release information\s*==\s*(.*?)(?=\n==|\Z)', text, re.S)
    f['release'] = clean(ms.group(1)) if ms else None
    return f

raw = json.load(open('raw/figures_wikitext.json'))
figs = [parse_figure(t, w) for t, w in sorted(raw.items())]
import os; os.makedirs('../data', exist_ok=True)
json.dump(figs, open('../data/figures.json', 'w'), ensure_ascii=False, indent=1)
print(len(figs), 'figures')
nowheel = [f['title'] for f in figs if not f['wheels']]
print('without wheels:', len(nowheel), nowheel[:15])
noinfo = [f['title'] for f in figs if f.get('mp') is None]
print('no color:', [(f['title'], k) for f in figs for k,w in f['wheels'].items() for x in w if x['color'] is None][:10])
print('without mp:', len(noinfo), noinfo[:15])
from collections import Counter
print(Counter(f.get('rarity') for f in figs))
print(Counter(f.get('type') for f in figs).most_common(25))
print(Counter(s['color'] for f in figs for w in f['wheels'].values() for s in w))
print(Counter(s['kind'] for f in figs for w in f['wheels'].values() for s in w))
