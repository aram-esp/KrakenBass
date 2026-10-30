/*
 * The duel screen, built in one place for the dev page and the published page. Layout after the original app's
 * field screenshot (research/img/field.png): a black ticker with the last event, the two players' banners (blue you,
 * red the opponent) with the turn counter between them, the board filling the middle (benches and P.C. slots drawn on
 * it by the 2.5D view), and at the bottom the yellow "IA" button (the original's AI button plays your turn) and a bar
 * with Forfeit and the other controls. All drawn here; no art from the game is used.
 */

const CSS = `
:root { --bg: #0e1424; --ink: #ffffff; --mute: #a8b6d6; --blue: #1f63e0; --red: #d42f3a; --yellow: #ffd21f; --go: #4cd964;
  --font: "Nunito", system-ui, -apple-system, "Segoe UI", sans-serif; color-scheme: dark; }
html, body { height: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 700 14px/1.35 var(--font); overflow: hidden; }
* { box-sizing: border-box; }
#app { display: flex; flex-direction: column; height: 100%; }
.gut { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
#ticker { background: #000; color: #2fb6ff; font-weight: 900; font-size: 15px; padding-block: 4px; min-height: 27px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#players { display: grid; grid-template-columns: 1fr auto 1fr; align-items: stretch; height: 52px; }
.pl { display: flex; align-items: center; gap: 10px; padding: 0 12px; min-width: 0; font-size: 18px; font-weight: 900; text-shadow: 0 2px 0 #0006; }
.pl.you { background: linear-gradient(90deg, #0f3fa8, #2a74f0); clip-path: polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%); }
.pl.ai { background: linear-gradient(90deg, #e0434c, #8e1720); justify-content: flex-end; clip-path: polygon(14px 0, 100% 0, 100% 100%, 0 100%); }
.pl.dim { filter: saturate(.55) brightness(.7); }
.pl .av { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-size: 13px;
  background: #ffffff2e; border: 2px solid #ffffffaa; flex-shrink: 0; }
.pl small { font-size: 12px; font-weight: 800; color: #ffffffcc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#turnBox { background: #12151c; border: 3px solid #c9ced8; border-radius: 6px; margin: 2px -6px; z-index: 1; display: flex;
  flex-direction: column; align-items: center; justify-content: center; padding: 0 14px; transform: skewX(-8deg); }
#turnBox small { font-size: 10px; letter-spacing: .12em; color: #c9ced8; }
#turnBox b { font-size: 22px; line-height: 1; color: var(--yellow); font-variant-numeric: tabular-nums; }
#stage { position: relative; min-height: 0; flex: 1; }
#view, #view2d { width: 100%; height: 100%; display: block; touch-action: manipulation; }
#view[hidden], #view2d[hidden] { display: none; }
#status { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
#log { position: absolute; right: max(10px, env(safe-area-inset-right, 0px)); top: 10px; width: min(320px, 80vw); max-height: 55%; overflow: auto;
  background: #000c; padding: 8px 10px; border-radius: 10px; font-size: 12px; font-weight: 700; display: none; }
#log.show { display: block; } #log div { margin: 2px 0; }
#bench { position: absolute; left: 0; right: 0; bottom: 6px; display: none; flex-wrap: wrap; gap: 6px; justify-content: center; }
#bench.show { display: flex; }
.chip { border: 2px solid var(--mute); border-radius: 10px; padding: 4px 8px; background: #000a; color: var(--ink); cursor: pointer; font: inherit; }
.chip.sel { outline: 2px solid #fff; } .chip.off { opacity: .45; cursor: default; }
#dock { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; padding-block: 6px;
  background: linear-gradient(180deg, #2a1d14, #1a120c); border-top: 2px solid #5a3f2a; }
#disk { justify-self: start; width: 64px; height: 64px; border-radius: 50%; border: 3px solid #555c6b; background: #1b1e26; padding: 0; cursor: pointer; }
#disk canvas { width: 100%; height: 100%; border-radius: 50%; display: block; }
#aiBtn { font: 900 26px/1 var(--font); color: #3a2a00; padding: 12px 54px; border-radius: 12px; border: 3px solid #fff2a8;
  background: linear-gradient(180deg, #ffe55a, #ffd21f 45%, #f2b300); box-shadow: 0 3px 0 #a87b00; cursor: pointer; }
#aiBtn:disabled { filter: grayscale(.8) brightness(.6); cursor: default; }
#platesBox { justify-self: end; min-width: 64px; }
#platesBtn { position: relative; width: 62px; height: 78px; border-radius: 8px; border: 2px solid #3a4356; cursor: pointer; color: #fff;
  background: linear-gradient(160deg, #2a2f3c, #101319 60%); font: 900 12px/1.1 var(--font); box-shadow: 4px 4px 0 #0a0d14, 8px 8px 0 #06080d; }
#platesBtn b { display: block; font-size: 22px; color: var(--yellow); }
#platesBtn:disabled { opacity: .5; cursor: default; }
#platePanel { position: absolute; right: max(10px, env(safe-area-inset-right, 0px)); bottom: 10px; width: min(340px, 92vw); max-height: 75%;
  overflow: auto; background: #0b0f1aee; border: 2px solid #3a4356; border-radius: 12px; padding: 10px; display: none; flex-direction: column; gap: 6px; }
#platePanel.show { display: flex; }
#platePanel h3 { margin: 0 0 4px; font: 900 16px var(--font); }
.pl-item { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; text-align: left; border-radius: 8px; border: 2px solid #3a4356;
  background: #141925; color: #fff; font: 800 13px/1.25 var(--font); padding: 6px 8px; cursor: pointer; }
.pl-item small { grid-column: 1 / -1; color: var(--mute); font-weight: 700; font-size: 11px; }
.pl-item:disabled { opacity: .45; cursor: default; } .pl-item.used { text-decoration: line-through; }
.pl-item .cost { color: var(--yellow); }
#bar { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; padding-block: 6px; background: #0b0f1a; }
#bar button { background: linear-gradient(180deg, #24365e, #142342); color: #fff; border: 2px solid #4a6aa8; border-radius: 8px; padding: 6px 12px;
  font: 900 14px/1.1 var(--font); cursor: pointer; }
#bar button:hover:not(:disabled) { border-color: #8fb2ff; } #bar button:disabled { opacity: .45; cursor: default; }
#forfeit.armed { background: #8e1720; border-color: #ff8a90; }
#hint { color: var(--mute); min-width: 0; flex: 1 1 200px; font-size: 13px; }
#note { color: #6b7896; font-size: 10px; padding-block: 3px; background: #0b0f1a; }
button:focus-visible, .chip:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
#wheels { position: absolute; inset: 0; display: none; flex-wrap: wrap; align-content: center; align-items: center; justify-content: center;
  gap: 16px 40px; background: radial-gradient(circle at 50% 45%, #10224acc, #000d 70%); }
#wheels.show { display: flex; } #wheels figure { margin: 0; text-align: center; }
#wheelsTitle { flex-basis: 100%; text-align: center; font-size: 20px; font-weight: 900; }
#wheels canvas { width: min(220px, 38vw); height: min(220px, 38vw); } #wheels figcaption { margin-top: 6px; font-weight: 800; }
#wheels .fate { margin-top: 2px; font-weight: 900; } #wheels .fate.hit { color: #ff7a80; } #wheels .fate.stop { color: var(--go); } #wheels .fate.none { color: var(--mute); }
#turnBanner { position: absolute; left: 0; right: 0; top: 38%; display: none; justify-content: center; pointer-events: none; }
#turnBanner.show { display: flex; animation: tb-in 1.3s ease-in-out both; }
#turnBanner b { font: 900 clamp(26px, 6vw, 46px)/1 var(--font); padding: 12px 60px; letter-spacing: .04em; color: #fff;
  text-shadow: 0 3px 0 #0008; clip-path: polygon(4% 0, 100% 0, 96% 100%, 0 100%); }
#turnBanner.you b { background: linear-gradient(90deg, transparent, #1f63e0 18%, #2a74f0 82%, transparent); }
#turnBanner.ai b { background: linear-gradient(90deg, transparent, #d42f3a 18%, #e0434c 82%, transparent); }
@keyframes tb-in { 0% { opacity: 0; transform: translateX(-30%); } 20%, 80% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateX(30%); } }
#wheels.intro figure:first-of-type { animation: vs-left .8s cubic-bezier(.2,.9,.3,1.2) both; }
#wheels.intro figure:last-of-type { animation: vs-right .8s cubic-bezier(.2,.9,.3,1.2) both; }
#wheels.intro #wheelsTitle { animation: vs-pop .8s ease-out both; }
@keyframes vs-left { from { transform: translateX(-60vw) rotate(-30deg); opacity: 0; } }
@keyframes vs-right { from { transform: translateX(60vw) rotate(30deg); opacity: 0; } }
@keyframes vs-pop { 0% { transform: scale(2.4); opacity: 0; } 60% { transform: scale(.9); opacity: 1; } }
.pl.turn { box-shadow: inset 0 -4px 0 var(--yellow); }
.clock { font-variant-numeric: tabular-nums; }
.clock.low { color: #ffd21f; }
@media (prefers-reduced-motion: reduce) { #turnBanner.show, #wheels.intro figure, #wheels.intro #wheelsTitle { animation: none; } }
#banner { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  background: #000b; font-size: 34px; font-weight: 900; text-align: center; }
#banner.show { display: flex; }
#banner button { font: 900 18px var(--font); padding: 10px 26px; border-radius: 12px; border: 3px solid #fff2a8; color: #3a2a00;
  background: linear-gradient(180deg, #ffe55a, #ffd21f 45%, #f2b300); cursor: pointer; }
#banner #toMenu { background: #1b2a4d; color: #fff; border-color: #4a6aa8; }
@media (max-width: 560px) { .pl { font-size: 15px; } .pl small { display: none; } #aiBtn { padding: 10px 34px; font-size: 22px; } }
`;

/** Build the duel screen inside #app (the dev and published pages only provide the empty #app). */
export function buildHud(): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const app = document.getElementById('app')!;
  app.innerHTML = `
  <div id="ticker" class="gut" role="status" aria-live="polite"></div>
  <div id="players">
    <div class="pl you" id="plYou"><i class="av">TÚ</i><span>Tú <small class="clock" id="youClock"></small><br><small id="youInfo"></small></span></div>
    <div id="turnBox" aria-label="Turno"><small>TURNO</small><b id="turnNum">1</b></div>
    <div class="pl ai" id="plAi"><span style="text-align:right"><small class="clock" id="aiClock"></small> IA<br><small id="aiInfo"></small></span><i class="av">IA</i></div>
  </div>
  <div id="stage">
    <canvas id="view2d"></canvas><canvas id="view" hidden></canvas>
    <span id="status"></span>
    <div id="log" aria-label="Registro"></div>
    <div id="bench" aria-label="Tus figuras"></div>
    <div id="wheels"><figure><canvas width="440" height="440" id="w0"></canvas><figcaption id="c0"></figcaption></figure><figure><canvas width="440" height="440" id="w1"></canvas><figcaption id="c1"></figcaption></figure></div>
    <div id="platePanel" aria-label="Tus plates"></div>
    <div id="turnBanner" aria-hidden="true"><b id="turnBannerText"></b></div>
    <div id="banner"><div id="bannerText"></div><button id="again" type="button">Otra partida</button><button id="toMenu" type="button">Menú</button></div>
  </div>
  <div id="dock" class="gut">
    <button id="disk" type="button" title="Ruleta de la figura seleccionada"><canvas width="128" height="128" id="diskCanvas"></canvas></button>
    <button id="aiBtn" type="button" title="La IA juega este turno por ti">IA</button>
    <div id="platesBox"><button id="platesBtn" type="button" title="Tus plates">PLATES<b id="platesLeft">0</b></button></div>
  </div>
  <div id="bar" class="gut">
    <button id="forfeit" type="button">Rendirse</button>
    <span id="hint"></span>
    <button id="end" type="button">Terminar turno</button>
    <button id="logBtn" type="button">Registro</button>
    <button id="viewToggle" type="button">Vista 2D</button>
    <button id="menuBtn" type="button">Menú</button>
  </div>
  <div id="note" class="gut">Proyecto personal sin ánimo de lucro. No está afiliado ni respaldado por The Pokémon Company. Sprites de PokeAPI (Pokémon Negro y Blanco), © Nintendo / Game Freak / The Pokémon Company.</div>`;
  document.getElementById('logBtn')!.onclick = () => document.getElementById('log')!.classList.toggle('show');
}
