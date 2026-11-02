"""Training Center stages of Pokémon Duel (Bulbapedia "Training Center (Duel)") -> data/training.json.

Source: research/raw/pages_wikitext.json (Bulbapedia wikitext, fetched earlier). Keeps both stage sets
(version 2.0.0-5.0.9 and version 5.0.10) and the tutorial, with the opponent's deck and plates, the player's deck
and plates (pokemon / plate = opponent, ppokemon / pplate = player), the three challenges and the rewards.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
text = json.loads((ROOT / 'research/raw/pages_wikitext.json').read_text())['Training Center (Duel)']


def blocks(t):
    i = 0
    while (i := t.find('{{DuelQuest', i)) >= 0:
        depth, j = 0, i
        while j < len(t):
            if t.startswith('{{', j): depth += 1; j += 2; continue
            if t.startswith('}}', j):
                depth -= 1; j += 2
                if depth == 0: break
                continue
            j += 1
        yield i, t[i + 2:j - 2]
        i = j


def clean(v):
    v = re.sub(r'\{\{DL\|[^|}]*\|([^}]*)\}\}', r'\1', v)
    v = re.sub(r'\{\{TFG ID\|Duel\|([^|}]*)\|(\d+)\}\}', r'\1', v)
    v = re.sub(r'\[\[(?:[^]|]*\|)?([^]]*)\]\]', r'\1', v)
    v = re.sub(r"'''?", '', v)
    return v.strip()


def fields(b):
    out = {}
    # Top-level "|key=value" pairs (values may hold nested templates).
    depth, cur, parts = 0, '', []
    for k, ch in enumerate(b):
        if b.startswith('{{', k): depth += 1
        if b.startswith('}}', k): depth -= 1
        if ch == '|' and depth == 0:
            parts.append(cur); cur = ''
        else:
            cur += ch
    parts.append(cur)
    for p in parts[1:]:
        if '=' in p:
            k, v = p.split('=', 1)
            out[k.strip()] = v.strip()
    return out


# Bulbapedia uses Duel library numbers; data/figures.json ids differ for figures whose page holds several variants
# ("Eevee (Duel 57)" has id 512). Map library number -> record id.
recs = json.loads((ROOT / 'data/figures.json').read_text())
by_id = {str(r['id']) for r in recs}
lib = {}
for r in recs:
    m = re.search(r'\(Duel (\d+)\)', r['title'])
    if m: lib[m.group(1)] = str(r['id'])
resolve = lambda i: lib.get(i, i if i in by_id else None)

sections = [(m.start(), m.group(1)) for m in re.finditer(r'\n===([^=\n]+)===\n', text)]
stages = []
for pos, b in blocks(text):
    sec = [s for p, s in sections if p < pos][-1]
    f = fields(b)
    stage = {
        'set': 'tutorial' if sec == 'Tutorial' else sec.replace('Version ', ''),
        'title': clean(f.get('title', '')),
        'opponent': clean(f.get('opponent', '')),
        'challenges': [clean(f[k]) for k in ('challenge1', 'challenge2', 'challenge3') if f.get(k)],
        'opponentDeck': [resolve(f[f'id{k}']) for k in range(1, 7) if f.get(f'id{k}')],
        'opponentPlates': [clean(f[f'plate{k}']) for k in range(1, 7) if f.get(f'plate{k}') and clean(f[f'plate{k}']) != 'None'],
        'playerDeck': [resolve(f[f'pid{k}']) for k in range(1, 7) if f.get(f'pid{k}')],
        'playerPlates': [clean(f[f'pplate{k}']) for k in range(1, 7) if f.get(f'pplate{k}')],
        'reward': clean(f.get('bonus', '')),
    }
    stages.append(stage)
    assert None not in stage['opponentDeck'] + stage['playerDeck'], stage['title']

(ROOT / 'data/training.json').write_text(json.dumps(stages, ensure_ascii=False, indent=1))
print(len(stages), 'stages')
for s in stages:
    print(s['set'], '|', s['title'], '|', s['opponentDeck'], s['opponentPlates'], '|', s['playerDeck'], s['playerPlates'], '|', s['challenges'], '|', s['reward'])
