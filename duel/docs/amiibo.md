# Cómo funcionan por dentro los amiibo de Smash (y cómo traerlo a Duel)

Investigado el 2026-11-02. Nintendo no ha publicado cómo funcionan; todo sale de wikis de la comunidad y de datamining.
Lo que no tiene fuente sólida va marcado.

## 1. Lo que se sabe

### Qué es un amiibo en Smash
- Al escanear la figura se crea un **Figure Player (FP)**: un luchador controlado por la IA que pelea, aprende y sube de
  nivel. Su progreso se guarda **en el chip de la figura**, no en la consola. [SmashWiki "Figure Player"]
- Niveles 1 a 50. En *Ultimate* el daño que hace pasa de ×0,9 (nivel 1) a ×1,3 (nivel 50) de forma lineal, y el daño
  que recibe baja de ~+11 % a ~−23 %. Sigue aprendiendo tras el 50. [SmashWiki]
- Base + entrenamiento: el FP usa la **IA normal del personaje** y la modifica con los datos de entrenamiento guardados
  en el chip. Si sube del 1 al 50 sin aprender, se queda con la IA por defecto del personaje. [Exion Vault "Level",
  "Learn Button"]
- Se dice que Smash solo tiene unos **220 bytes** del chip para esos datos. ⚠️ Sin confirmar (comentario de un foro).

### Cómo aprende
- Con **Learning** activado copia el estilo de quien le pega: un FP de Zero Suit Samus entrenado contra Ganondorf acaba
  usando su ataque fuerte abajo como él, aunque el suyo no le venga igual de bien. Es **imitación**, no búsqueda de lo
  que funciona mejor. [Exion Vault "Learn Button"]
- En *Smash 4* el ejemplo es alguien que se queda lejos atacando a distancia: el amiibo empieza a hacer lo mismo. [SmashWiki]
- Con Learning desactivado no cambia entre partidas, pero sigue subiendo de nivel. [Exion Vault]
- Los de nivel alto se adaptan más rápido dentro de una partida (por ejemplo, esquivan más si les atacas sin parar). [SmashWiki]
- SmashWiki avisa de que el sistema de aprendizaje es rudimentario, y de que muchos vídeos sobre la IA aprendiendo
  probablemente son sesgo de confirmación.

### Los datos de comportamiento (datamining de *Ultimate*)
- **66 atributos**, cada uno entre **0,0 y 1,0**. 34 influyen en la personalidad. Algunos nombres: `offensive`,
  `grounded`, `shield master`, `dash`, `near`, `appeal`, `cliffer`, `feint master`, `just shield master`… [Tricks of the
  Trade, "Amiibo Personality Analysis"]
- Valor `Offensive` alto = ataca más a menudo; bajo = defiende más. [Exion Vault "Editing", guía general]
- **Personalidad** = resumen de esos números. Hay 8 ramas: defensiva (`def`), ágil (`agl`), ofensiva (`ofn`), arriesgada
  (`rsk`), versátil (`gen`), espectáculo (`ent`), prudente (`cau`) y dinámica (`dyn`).
  - Cada rama tiene una condición de entrada; por ejemplo, la defensiva exige `offensive` < 0,26.
  - Cada atributo suma o resta puntos a su rama según en qué tramo esté.
  - Gana la rama con más puntos, y los puntos deciden el nivel. Ofensiva: Enthusiastic ≥ 100, Aggressive ≥ 180,
    Offensive ≥ 235.
  - Si ninguna rama cumple su condición, la personalidad es **Normal**, que es con la que empiezan todos.
- Los **espíritus** cambian estadísticas y también desordenan esos datos (por eso la personalidad cambia al dárselos).
  [SmashWiki, Exion Vault]
- ⚠️ Las fuentes no coinciden en algún umbral, como la condición de la rama `rsk`.

## 2. Qué significa para nosotros

La IA nueva de Duel (`src/ai.ts`, 2026-11-02) ya funciona igual por dentro: una **IA base** que puntúa cada jugada con
unos **pesos** (`AiWeights`: peligro en tu portería, amenaza a la rival, avance, rodear, valor de un KO, exposición,
vigilar la portería, ruido). Un amiibo de Duel sería simplemente **un juego de pesos guardado por figura**, que es lo
mismo que hace Smash con sus 66 atributos.

## 3. Propuesta: «Figura entrenable» (diseño mío, inventado)

- **Qué es:** una de tus figuras (Pikachu, por ejemplo) se convierte en un FP con nombre, nivel 1–50 y sus pesos.
  - Pelea con un mazo que le das y puedes jugar contra él o dejar que juegue por ti.
  - Se guarda en `localStorage` como un JSON pequeño, el equivalente a los 220 bytes del chip.
- **Aprende por imitación, como en Smash.** Cuando juegas, en cada turno se mira qué jugada elegiste y qué rasgos
  tenía (¿defendiste la portería?, ¿atacaste?, ¿avanzaste?, ¿rodeaste?). Los pesos del FP se mueven un poco hacia los
  que explicarían tu elección.
  - Técnicamente: un paso de aprendizaje por preferencias que compara tu jugada con las que puntuó mejor su IA.
  - Si tú defiendes mucho, él defenderá mucho; si te lanzas a por la portería, él también.
- **Nivel:** sube con la experiencia de los duelos. A nivel bajo comete más errores, con mucho `noise` (aleatoriedad);
  a nivel alto apenas tiene. ⚠️ En Smash el nivel sube el daño; aquí eso rompería las ruletas, así que el nivel solo
  afinaría la IA.
- **Botón «Aprender»:** activado o desactivado, como en *Ultimate*.
- **Personalidad visible** calculada desde los pesos, con ramas y umbrales al estilo Smash:
  - Defensivo: peso alto en vigilar la portería y en el peligro.
  - Ofensivo: amenaza y avance altos.
  - Temerario: exposición baja.
  - Cazador: KO alto.
  - Táctico: rodear alto.
  - Normal: los pesos de serie.
- **Modos:** «Entrenar» (te enfrentas a él y aprende de ti), «Enviar a la liga» (juega solo contra la IA y gana
  experiencia) y «Duelo amiibo» (tu FP contra la IA o contra otro FP).
- **Sin espíritus:** en su lugar se le podrían «dar» plates para empujar un rasgo.

## Fuentes
- SmashWiki, "Figure Player": https://www.ssbwiki.com/Figure_Player
- SmashWiki, "Artificial intelligence": https://www.ssbwiki.com/Artificial_intelligence
- Exion Vault, "amiibo Wiki: Learn Button": https://exionvault.com/amiibo-wiki-learn-button/
- Exion Vault, "amiibo Wiki: Level": https://exionvault.com/amiibo-wiki-level/
- Exion Vault, "amiibo Wiki: Personalities": https://exionvault.com/amiibo-wiki-personalities/
- Exion Vault, "amiibo Wiki: Editing": https://exionvault.com/amiibo-wiki-editing/
- Tricks of the Trade, "Amiibo Personality Analysis": https://blog.tricksofthetrade.pro/posts/amiibo-personality-analysis
- GBAtemp, "SSBU Amiibo Personality Research & Discovery": https://gbatemp.net/threads/ssbu-amiibo-personality-research-discovery.532359/
