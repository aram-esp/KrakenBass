import { NOTES, WORKING, pendingReason } from '../../src/abilities.ts';
import { UNSUPPORTED, effectStatus } from '../../src/effects.ts';
import type { FigureRecord } from '../../src/data.ts';
import { plateSpec, type PlateDef } from '../../src/plates.ts';
import {
  BOOSTERS, CASE_SLOTS, EVOLVE_BATTLES, EVOLVE_DUELS, GEMS_LOSS, GEMS_WIN, PLATE_CHANCE, RARITY_WEIGHT, SHOP_PRICE, STARTER_PLATES, TIMED_WEIGHT, gemsToOpenNow,
} from '../../src/gacha.ts';
import { defaultRules } from '../../src/rules.config.ts';
import {
  CARMONITE_MATERIAL, CARMONITE_PER_LEVEL, CHAIN_COPIES, DUEL_EXP, EXCHANGE_PRICE, FIGURE_BASE_EXP, FUSION_COINS_PER_CHAIN, FUSION_COINS_PER_EXP,
  INGOT_COINS, LEVEL_EXP, MAX_CHAIN, METAL_EXP, PLATE_COINS, RARS, RAR_SHORT, SELL_LV1, SHOP_MATERIAL,
} from '../../src/progress.ts';
import type { FigureDef } from '../../src/types.ts';
import { MOVE_COLOR, spriteSrc } from './shared.ts';

/*
 * In-game Pokédex (rules, figures, abilities, boosters, evolution). Every fact comes from the game's own data and rules (data/figures.json, src/*.ts) or from the
 * research notes; house rules and invented values are labelled as such.
 */

export const TYPE_ES: Record<string, string> = {
  Normal: 'Normal', Fire: 'Fuego', Water: 'Agua', Electric: 'Eléctrico', Grass: 'Planta', Ice: 'Hielo', Fighting: 'Lucha',
  Poison: 'Veneno', Ground: 'Tierra', Flying: 'Volador', Psychic: 'Psíquico', Bug: 'Bicho', Rock: 'Roca', Ghost: 'Fantasma',
  Dragon: 'Dragón', Dark: 'Siniestro', Steel: 'Acero', Fairy: 'Hada',
};
const COLOR_ES: Record<string, string> = { white: 'Blanco', gold: 'Dorado', purple: 'Morado', blue: 'Azul', red: 'Fallo' };
const RARITY_ES: Record<string, string> = { Common: 'Común (C)', Uncommon: 'Poco común (UC)', Rare: 'Rara (R)', EX: 'EX', UX: 'UX' };

export const WIKI_CSS = `
.dm .wiki { width: 100%; max-width: 860px; display: flex; flex-direction: column; gap: 14px; }
.dm .wiki .sections { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.dm .wiki article { background: var(--dm-panel); border: 3px solid #1d2433; border-radius: 16px; padding: 14px 16px; line-height: 1.5; }
.dm .wiki article h2 { margin: 0 0 8px; font: 900 22px/1.2 var(--dm-font); }
.dm .wiki article h3 { margin: 14px 0 4px; font: 900 17px/1.2 var(--dm-font); color: var(--dm-yellow); }
.dm .wiki p, .dm .wiki li { color: #dfe7f5; max-width: 70ch; }
.dm .wiki ul { margin: 4px 0; padding-left: 20px; }
.dm .wiki .tag { display: inline-block; border-radius: 6px; padding: 0 6px; font-size: 12px; font-weight: 800; background: #ffffff1a; margin-right: 4px; }
.dm .wiki .tag.house { background: #1557c9; } .dm .wiki .tag.inv { background: #8a5a00; } .dm .wiki .tag.ok { background: #1f7a3a; } .dm .wiki .tag.no { background: #6b2430; }
.dm .wiki .tbl { overflow-x: auto; }
.dm .wiki table { border-collapse: collapse; width: 100%; font-size: 14px; font-variant-numeric: tabular-nums; }
.dm .wiki th, .dm .wiki td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #ffffff1a; vertical-align: top; }
.dm .wiki th { color: var(--dm-mute); font-weight: 800; }
.dm .wiki .dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; vertical-align: -1px; margin-right: 6px; border: 1px solid #0006; }
.dm .wiki input[type=search] { width: 100%; font: 700 16px var(--dm-font); padding: 10px 12px; border-radius: 10px; border: 2px solid #4a5f8c; background: #0c1730; color: #fff; }
.dm .wiki details { border-bottom: 1px solid #ffffff14; padding: 6px 0; }
.dm .wiki summary { cursor: pointer; display: flex; align-items: center; gap: 10px; font-weight: 800; list-style: none; }
.dm .wiki summary::-webkit-details-marker { display: none; }
.dm .wiki summary img { width: 44px; height: 44px; image-rendering: pixelated; object-fit: contain; }
.dm .wiki summary small { color: var(--dm-mute); font-weight: 700; }
.dm .wiki .figbody { padding: 6px 0 8px 54px; }
@media (max-width: 560px) { .dm .wiki .figbody { padding-left: 0; } }
`;

export interface WikiData {
  pool: FigureDef[];
  extras: FigureDef[];
  records: FigureRecord[];
  evolves: Record<string, string[]>;
  owned: () => Record<string, number>;
  plates?: PlateDef[];
  ownedPlates?: () => Record<string, number>;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const pct = (n: number, total: number) => `${Math.round((n / total) * 1000) / 10} %`;

export function renderWiki(root: HTMLElement, d: WikiData): void {
  const rec = new Map(d.records.map((r) => [String(r.id), r]));
  const all = [...d.pool, ...d.extras];
  const byId = new Map(all.map((f) => [f.id, f]));
  const from = new Map<string, string[]>();
  for (const [a, tos] of Object.entries(d.evolves)) for (const t of tos) if (byId.has(t)) from.set(t, [...(from.get(t) ?? []), a]);
  const extraIds = new Set(d.extras.map((f) => f.id));

  const sections: [string, string, () => string][] = [
    ['jugar', 'Cómo jugar', howToPlay],
    ['figuras', 'Figuras', () => figures()],
    ['habilidades', 'Habilidades', abilities],
    ['plates', 'Plates', platesSection],
    ['boosters', 'Boosters', boosters],
    ['evolucion', 'Evolución', evolution],
    ['mejora', 'Niveles y fusión', upgrade],
  ];
  root.innerHTML = `<div class="wiki"><div class="sections" id="wikiNav"></div><div id="wikiBody"></div></div>`;
  const nav = root.querySelector<HTMLElement>('#wikiNav')!, body = root.querySelector<HTMLElement>('#wikiBody')!;
  const show = (key: string) => {
    const s = sections.find((x) => x[0] === key)!;
    body.innerHTML = `<article><h2>${s[1]}</h2>${s[2]()}</article>`;
    for (const b of nav.querySelectorAll<HTMLElement>('button')) b.classList.toggle('on', b.dataset.key === key);
    if (key === 'figuras') wireFigures();
  };
  for (const [key, label] of sections) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ghost'; b.textContent = label; b.dataset.key = key;
    b.onclick = () => show(key);
    nav.appendChild(b);
  }
  show('jugar');

  function howToPlay(): string {
    const colours: [string, string][] = [
      ['white', 'Ataque con daño. Contra blanco o dorado gana el que más daño hace.'],
      ['gold', 'Ataque con daño y prioridad: gana al morado.'],
      ['purple', 'Ataque de efecto: gana al blanco. Entre dos morados ganan más estrellas ★.'],
      ['blue', 'Defensa (Protección, Esquiva…): gana a todos los demás colores.'],
      ['red', 'Fallo: pierde contra cualquier otro.'],
    ];
    return `
      <p>Dos jugadores, 6 figuras cada uno. Ganas si llevas una figura a la <b>portería del rival</b>
      (el círculo naranja de arriba), o si el rival no puede hacer ninguna jugada.</p>
      <h3>Qué son los MP</h3>
      <p>Los <b>MP</b> (puntos de movimiento) son cuántas casillas puede avanzar una figura en tu turno, normalmente de 1 a 3.
      Las figuras no pueden saltar por encima de otras. Salir del banquillo a una casilla de entrada (los anillos de las esquinas)
      gasta 1 MP. Quien empieza la partida tiene −${defaultRules.firstTurnMpPenalty} MP en todas sus figuras durante su primer turno.
      El número a los pies de cada figura son los MP que tiene ese turno.</p>
      <h3>El turno</h3>
      <ul><li>Mueves <b>una</b> figura (o ninguna).</li>
      <li>Si una de tus figuras está al lado de una rival, puedes atacarla: eso termina tu turno.</li>
      <li>Una figura con <b>Wait</b> no puede moverse ni atacar durante esos turnos (cuentan los de los dos jugadores).</li>
      <li>Una figura rodeada por figuras rivales en todas sus casillas vecinas queda fuera de combate sin combatir.</li>
      <li>Si a los ${defaultRules.turnLimit} turnos nadie ha ganado, pierden los dos.</li></ul>
      <h3>Combate: la ruleta</h3>
      <p>Las dos figuras giran su ruleta. El color de la casilla en la que para decide:</p>
      <div class="tbl"><table><tr><th>Color</th><th>Qué hace</th></tr>
      ${colours.map(([c, t]) => `<tr><td><span class="dot" style="background:${MOVE_COLOR[c]}"></span>${COLOR_ES[c]}</td><td>${t}</td></tr>`).join('')}
      </table></div>
      <p>Como en el original: solo un ataque <b>blanco o dorado</b> que gana deja fuera de combate al rival (va al <b>P.C.</b>).
      Si gana un <b>morado</b>, aplica su efecto (veneno, sueño, empujar…) y nadie cae. Si gana un <b>azul</b>, esquiva.
      Si empatan, no pasa nada. Los ataques con <b>*</b> aplican su efecto aunque pierdan (primero los del atacante).</p>
      <h3>Estados alterados</h3>
      <p>Solo uno a la vez (uno nuevo sustituye al anterior); se quitan al volver al banquillo o al P.C. Fuente: Bulbapedia.</p>
      <div class="tbl"><table><tr><th>Estado</th><th>Efecto</th></tr>
      <tr><td>Veneno</td><td>−20 de daño en ataques blancos y dorados.</td></tr>
      <tr><td>Veneno grave</td><td>−40 de daño.</td></tr>
      <tr><td>Parálisis</td><td>El ataque con menos casillas de su ruleta se convierte en fallo.</td></tr>
      <tr><td>Quemadura</td><td>Como la parálisis, y además −10 de daño.</td></tr>
      <tr><td>Sueño</td><td>No se mueve ni ataca, no bloquea el paso ni ayuda a rodear. Se despierta si le atacan o si un aliado de al lado lo toca (casilla morada; termina tu turno).</td></tr>
      <tr><td>Congelación</td><td>Como el sueño, y todos sus ataques fallan. Se quita tras un combate.</td></tr>
      <tr><td>Confusión</td><td>La ruleta se desplaza una casilla antes de leer el resultado.</td></tr>
      </table></div>
      <h3>Wait y marcadores</h3>
      <p>Wait N: no puede moverse ni atacar durante N turnos (cuentan los de los dos jugadores). "Wait" sin número: se salta su
      siguiente turno (en el juego de mesa duraba un turno). Los marcadores de MP (−1, −2) restan movimiento mientras siga en el tablero.</p>
      <h3>Habilidades que eliges</h3>
      <p>Al seleccionar una figura, las casillas con anillo <b>morado</b> son movimientos de habilidad (Run Off, Swarm, Forest Leap,
      Cut Off) o despertar a un aliado. Las habilidades de defensa (Run Away, Sand Veil) se usan solas siempre que pueden.</p>
      <h3>El P.C.</h3>
      <p>Las figuras derrotadas van al P.C., que guarda ${defaultRules.pcSize}. Cuando entra una tercera, la más antigua vuelve al banquillo.</p>
      <h3>Plates</h3>
      <p>Hasta 6 por mazo con un coste total de 6 como mucho (en las primeras versiones). Cada una se usa una vez por duelo, al
      principio de tu turno y antes de mover (la carta PLATES de abajo a la derecha). <span class="tag inv">Supuesto</span> Una por turno.</p>
      <h3>Lo que aún no está</h3>
      <p>Megaevolución y movimientos Z del original (por eso sus plates no se pueden usar). Cuatro efectos de ataque se muestran pero no hacen nada (lo pone en su ficha).</p>`;
  }

  function wheelTable(f: FigureDef): string {
    const total = f.wheel.reduce((s, x) => s + x.weight, 0);
    return `<div class="tbl"><table><tr><th>Ataque</th><th>Color</th><th>Daño / ★</th><th>Probabilidad</th><th>Efecto</th></tr>${f.wheel.map((s) => {
      const st = effectStatus(s.move);
      const why = st === 'no' ? UNSUPPORTED.find(([re]) => re.test(s.move.effect ?? ''))?.[1] : '';
      return `
      <tr><td>${esc(s.move.name)}</td><td><span class="dot" style="background:${MOVE_COLOR[s.move.color]}"></span>${COLOR_ES[s.move.color]}</td>
      <td>${s.move.damage ? s.move.damage : s.move.color === 'purple' ? '★'.repeat(s.move.stars || 1) : '—'}</td><td>${pct(s.weight, total)}</td>
      <td>${s.move.effect ? esc(s.move.effect.replace(/\{\{mp\}\}/g, 'MP').replace(/<!--.*?-->/g, '')) : '—'}${st === 'no' ? ` <span class="tag no">Sin efecto</span><br><i>${esc(why ?? '')}</i>` : ''}</td></tr>`;
    }).join('')}
      </table></div>`;
  }

  function abilityLine(f: FigureDef): string {
    if (!f.ability) return '<p>Sin habilidad.</p>';
    const ok = WORKING.has(f.ability.name);
    return `<p><b>★ ${esc(f.ability.name)}</b> <span class="tag ${ok ? 'ok' : 'no'}">${ok ? 'Funciona' : 'Aún sin efecto'}</span><br>
      ${esc(f.ability.effect)}${ok ? (NOTES[f.ability.name] ? `<br><i>${esc(NOTES[f.ability.name])}</i>` : '') : `<br><i>${esc(pendingReason(f.ability.name))}</i>`}</p>`;
  }

  function figures(): string {
    const sorted = [...all].sort((a, b) => a.name.localeCompare(b.name) || Number(a.id) - Number(b.id));
    const inv = d.extras.filter((f) => f.id.startsWith('x-')).length;
    return `<p>${d.pool.length} figuras de la versión 1.0.0 (salen en los boosters) y ${d.extras.length} que solo se consiguen
      evolucionando: ${d.extras.length - inv} figuras reales de versiones posteriores (con su ruleta de cuando salieron) y
      ${inv} <span class="tag inv">inventadas</span> para Pokémon que nunca tuvieron figura. Pulsa una para ver su ficha.</p>
      <input type="search" id="wikiSearch" placeholder="Buscar figura, tipo o habilidad" aria-label="Buscar figura">
      <div id="wikiFigs">${sorted.map((f) => {
        const r = rec.get(f.id);
        const types = [f.type, f.type2].filter(Boolean).map((t) => TYPE_ES[t!] ?? t).join(' / ');
        const evoTo = (d.evolves[f.id] ?? []).filter((t) => byId.has(t)).map((t) => byId.get(t)!.name);
        const evoFrom = (from.get(f.id) ?? []).map((t) => byId.get(t)?.name).filter(Boolean);
        const have = d.owned()[f.id] ?? 0;
        const search = `${f.name} ${types} ${f.ability?.name ?? ''}`.toLowerCase();
        return `<details data-s="${esc(search)}" data-id="${f.id}"><summary><img alt="" data-sprite="${f.id}">
          <span>${esc(f.name)}<br><small>${types} · ${RARITY_ES[r?.rarity ?? ''] ?? r?.rarity ?? ''} · ${f.mp} MP${have ? ` · tienes ${have}` : ''}</small></span></summary>
          <div class="figbody">
            <p>${f.id.startsWith('x-') ? '<span class="tag inv">Inventada</span> Este Pokémon no tuvo figura en Duel. Solo por evolución; ruleta de su preevolución con +10 de daño en blanco/dorado y +1★ en morado (lo que daba evolucionar en partida en el original), sus tipos reales y la habilidad de su preevolución, si la tenía.'
              : extraIds.has(f.id) ? `Solo por evolución · salió en la versión ${r?.version}` : 'Versión 1.0.0 · sale en los boosters'}</p>
            ${abilityLine(f)}
            ${wheelTable(f)}
            <p>${evoFrom.length ? `Evoluciona de: <b>${evoFrom.map((n) => esc(n!)).join(', ')}</b>. ` : ''}${evoTo.length ? `Evoluciona en: <b>${evoTo.map(esc).join(', ')}</b>.` : 'No evoluciona en ninguna figura de Duel.'}</p>
          </div></details>`;
      }).join('')}</div>`;
  }

  function wireFigures() {
    const input = root.querySelector<HTMLInputElement>('#wikiSearch')!;
    const items = [...root.querySelectorAll<HTMLDetailsElement>('#wikiFigs details')];
    input.oninput = () => { const q = input.value.trim().toLowerCase(); for (const it of items) it.hidden = !!q && !it.dataset.s!.includes(q); };
    // Sprites load as entries open, so the list stays light.
    for (const it of items) {
      const img = it.querySelector<HTMLImageElement>('img')!;
      const load = () => { if (!img.src) spriteSrc(img.dataset.sprite!).then((src) => { if (src) img.src = src; }); };
      new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { load(); o.disconnect(); } }).observe(it);
    }
  }

  function abilities(): string {
    const names = new Map<string, { effect: string; who: string[] }>();
    for (const f of all) if (f.ability) {
      const e = names.get(f.ability.name) ?? { effect: f.ability.effect, who: [] };
      e.who.push(f.name);
      names.set(f.ability.name, e);
    }
    const rows = [...names.entries()].sort((a, b) => Number(WORKING.has(b[0])) - Number(WORKING.has(a[0])) || a[0].localeCompare(b[0]));
    return `<p>Las figuras tienen la habilidad que tenían en el original en su versión (la 1.0.0, o la de su salida si se
      consiguen evolucionando). Las inventadas heredan la de su preevolución. ${rows.filter((r) => WORKING.has(r[0])).length} de ${rows.length} funcionan; las demás se muestran
      con su texto y el motivo por el que aún no hacen nada.</p>
      <div class="tbl"><table><tr><th>Habilidad</th><th>Estado</th><th>Efecto</th><th>Figuras</th></tr>
      ${rows.map(([n, e]) => `<tr><td><b>${esc(n)}</b></td>
        <td><span class="tag ${WORKING.has(n) ? 'ok' : 'no'}">${WORKING.has(n) ? 'Funciona' : 'Aún sin efecto'}</span></td>
        <td>${esc(e.effect)}${WORKING.has(n) ? (NOTES[n] ? `<br><i>${esc(NOTES[n])}</i>` : '') : `<br><i>${esc(pendingReason(n))}</i>`}</td><td>${esc(e.who.join(', '))}</td></tr>`).join('')}
      </table></div>`;
  }

  function platesSection(): string {
    const list = [...(d.plates ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    const ok = list.filter((p) => plateSpec(p).status === 'ok').length;
    const have = d.ownedPlates?.() ?? {};
    return `<p>${list.length} plates con su texto y coste originales (de su primera versión). ${ok} funcionan en este juego y son las que
      salen en los boosters (un ${Math.round(PLATE_CHANCE * 100)} % de los boosters trae una <span class="tag inv">inventado</span>). Al empezar
      tienes las del mazo de la captura del original: ${STARTER_PLATES.join(', ')}.</p>
      <div class="tbl"><table><tr><th>Plate</th><th>Coste</th><th>Rareza</th><th>Efecto</th><th>Estado</th></tr>
      ${list.map((p) => {
        const sp = plateSpec(p);
        return `<tr><td><b>${esc(p.name)}</b>${have[p.id] ? `<br><small>tienes ${have[p.id]}</small>` : ''}</td><td>${p.cost}</td><td>${esc(RARITY_ES[p.rarity] ?? p.rarity)}</td>
        <td>${esc(p.text)}</td><td>${sp.status === 'ok' ? '<span class="tag ok">Funciona</span>' : `<span class="tag no">No</span><br><i>${esc(sp.reason ?? '')}</i>`}</td></tr>`;
      }).join('')}</table></div>`;
  }

  function boosters(): string {
    const timed = (['white', 'blue', 'purple', 'gold', 'rainbow'] as const);
    const slot = (s: string) => (s === 'Common' ? 'cualquier figura' : `${RARITY_ES[s]} o mejor`);
    const tw = Object.values(TIMED_WEIGHT).reduce((a, b) => a + b, 0), rw = Object.values(RARITY_WEIGHT).reduce((a, b) => a + b, 0);
    return `<p>Las figuras se consiguen en boosters. Cada duelo da gemas (${GEMS_WIN} si ganas, ${GEMS_LOSS} si pierdes
      <span class="tag inv">inventado</span>) y, si hay hueco en la vitrina (${CASE_SLOTS} huecos <span class="tag inv">inventado</span>),
      un booster que se abre cuando pasa su tiempo, como en el original.</p>
      <div class="tbl"><table><tr><th>Booster</th><th>Espera</th><th>Contenido</th><th>Probabilidad de que te toque</th></tr>
      ${timed.map((k) => `<tr><td>${BOOSTERS[k].name}</td><td>${BOOSTERS[k].hours} h</td><td>${BOOSTERS[k].slots.map(slot).join(' + ')}</td><td>${pct(TIMED_WEIGHT[k], tw)}</td></tr>`).join('')}
      </table></div>
      <p>Tiempos y contenido: wiki archivada de Fandom (el original también daba lingotes, metales y cubos, que aquí no
      existen). Probabilidades de cada booster: <span class="tag inv">inventado</span>.</p>
      <h3>Abrir antes de tiempo</h3>
      <p>Pulsa el booster: te dice cuántas gemas cuesta y, si vuelves a pulsar, lo abre. Cuesta 1 gema por cada 10 minutos que
      falten (${gemsToOpenNow(3_600_000)} gemas por 1 hora) <span class="tag inv">inventado</span>. Que se podía hacer con gemas sí es del original.</p>
      <h3>Tienda</h3>
      <p>Booster a ${SHOP_PRICE} gemas (precio del original, según Nintendo Life) con ${BOOSTERS.shop.slots.map(slot).join(' + ')}
      <span class="tag inv">contenido inventado</span>.</p>
      <h3>Rareza de cada figura</h3>
      <div class="tbl"><table><tr><th>Rareza</th><th>Probabilidad en una casilla que la permite</th></tr>
      ${Object.entries(RARITY_WEIGHT).map(([r, w]) => `<tr><td>${RARITY_ES[r]}</td><td>${pct(w, rw)}</td></tr>`).join('')}</table></div>
      <p><span class="tag inv">inventado</span> No hay ninguna fuente con las probabilidades reales.</p>
      <h3>Al empezar</h3>
      <p>4 boosters de bienvenida con 8 figuras distintas <span class="tag inv">inventado</span>.</p>`;
  }

  function evolution(): string {
    const canEvo = d.pool.filter((f) => (d.evolves[f.id] ?? []).some((t) => byId.has(t))).length;
    return `<p><span class="tag house">Regla de la casa</span> Una figura puede evolucionar fuera de combate cuando ha
      participado en <b>${EVOLVE_BATTLES} combates</b> o ha estado en tu mazo en <b>${EVOLVE_DUELS} duelos</b>. Se hace en
      Mazos → Evolución: una copia se convierte en su evolución y sus contadores empiezan de cero.</p>
      <p>Ninguna figura de la 1.0.0 evoluciona en otra de la 1.0.0, así que evolucionan en figuras de versiones posteriores,
      con su ruleta y habilidad de cuando salieron. Si el Pokémon nunca tuvo figura en Duel (Golduck, Fearow…), la figura es
      <span class="tag inv">inventada</span>: la ruleta de su preevolución con +10 de daño y +1★, sus tipos reales y la habilidad de su preevolución, si la tenía.
      ${canEvo} de las ${d.pool.length} figuras de la 1.0.0 pueden evolucionar, y así se llega a ${d.extras.length} figuras más.</p>
      <p>Las cadenas de evolución vienen de PokeAPI. En el original las figuras evolucionaban durante la partida; eso aún no está.</p>`;
  }

  function upgrade(): string {
    const per = (o: Record<string, number>) => RARS.map((r) => `${RAR_SHORT[r]} ${o[r].toLocaleString('es')}`).join(' · ');
    return `<h3>Niveles (1 a 5)</h3>
      <p>Cada nivel da un punto para agrandar 1 una casilla de la ruleta: a nivel 5 la ruleta pasa de 96 a 100 y las casillas
      buenas pesan más que el Fallo. Se sube con experiencia: la dan los duelos (también si pierdes) y la fusión.
      <span class="tag inv">Inventado</span> Experiencia para el nivel 5: ${per(Object.fromEntries(RARS.map((r) => [r, LEVEL_EXP[r][4]])))}
      (en partes iguales por nivel); por duelo, ${DUEL_EXP.win} si ganas y ${DUEL_EXP.loss} si pierdes, a cada figura del mazo.
      <span class="tag inv">Supuesto</span> Los puntos no van al Fallo y se pueden recolocar cuando quieras; todas las copias de una figura comparten nivel
      (en el original cada copia tenía el suyo).</p>
      <h3>Fusión</h3>
      <p>Mazos → Fusión. Eliges una figura y le das otras figuras, Rare Metals, Cubos o lingotes; se gastan monedas y lo que fusionas se pierde.
      La figura gana la experiencia de todo lo que fusionas. Rare Metal: ${per(METAL_EXP)} EXP. Un lingote da 1 EXP (es para venderlo).
      <span class="tag inv">Inventado</span> Cada figura que fusionas da ${per(FIGURE_BASE_EXP)} EXP más la que tuviera; la fusión cuesta
      ${FUSION_COINS_PER_EXP} monedas por EXP y ${FUSION_COINS_PER_CHAIN} por punto de Chain. Las figuras de tu mazo guardan siempre una copia.</p>
      <h3>Chain Level</h3>
      <p>Fusionando copias de la misma figura (o Cubos de su misma rareza) sube el Chain Level; cada nivel da +1 de daño a un ataque
      blanco o dorado (40 → 41). Copias por nivel: ${per(CHAIN_COPIES)}. <span class="tag inv">Inventado</span> Un Cubo = una copia; máximo Chain Level ${MAX_CHAIN}.</p>
      <h3>Carmonite (niveles 6 a 10)</h3>
      <p>Desde el nivel 5. Cada nivel agranda una casilla 1 y encoge 1 otra que sea mayor de 4. Carmonite por nivel: ${per(CARMONITE_PER_LEVEL)}.
      <span class="tag inv">Inventado</span> Se consigue en el Intercambio de Material (${CARMONITE_MATERIAL} Material cada una).</p>
      <h3>Monedas, lingotes y Material</h3>
      <p>Las monedas salen de vender: lingotes (${per(INGOT_COINS)}), figuras repetidas (a nivel 1: ${per(SELL_LV1)}) y plates
      (${per(PLATE_COINS)}). Los boosters por tiempo traen un lingote, y del Azul en adelante también un Cubo o un Rare Metal.
      Comprar boosters da Material, que se cambia por figuras en la Tienda (Dialga, EX: 4.000).
      <span class="tag inv">Inventado</span> ${SHOP_MATERIAL} Material por booster de la Tienda; precios del Intercambio que no son EX
      (${RARS.slice(0, 3).map((r) => `${RAR_SHORT[r]} ${EXCHANGE_PRICE[r]}`).join(' · ')}); la rareza de lingotes, Cubos y Rare Metals usa los mismos pesos que las figuras.
      <span class="tag inv">Supuesto</span> El orden C, UC, R, EX de los precios de plates; las figuras repetidas se venden a nivel 1.</p>
      <p>Fuentes: Serebii (Mechanics), Bulbapedia (Enhancement, Shop, Time Booster) y la wiki de Fandom (Items, Figures).
      La IA juega con sus figuras sin mejorar.</p>`;
  }
}
