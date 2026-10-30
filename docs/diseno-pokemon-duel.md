# Documento de diseño: referencia de Pokémon Duel

> Investigación hecha el 29-10-2026 a partir de fuentes públicas (enlazadas al final).
> Lo marcado con ⚠️ no está verificado del todo o sale de una sola fuente.

## 1. Datos generales

| Campo | Valor |
|---|---|
| Nombre en Japón | ポケモンコマスター (*Pokémon Comaster*: "co" de juntos + "master" + la palabra japonesa para "pieza") |
| Desarrollo / edición | HEROZ (autores de *Shogi Wars*) / The Pokémon Company |
| Lanzamiento en Japón | Android 12-04-2016, iOS 19-04-2016 |
| Lanzamiento mundial | 24-01-2017 |
| Fin del servicio | Anunciado el 26-07-2019, cerrado el 31-10-2019 |
| Descargas | Más de 40 millones (anuncio de marzo de 2019) |
| Recaudación | 21,6 M$ hasta finales de 2018 ⚠️ (Wikipedia cita un artículo sobre *Pokémon Quest*) |
| Metacritic | 63/100 |

- **Origen:** es la adaptación del *Pokémon Trading Figure Game* (2006–2007), un juego de mesa con figuras físicas que nunca salió en Japón. Sus creadores, Masayuki Miura y Kōichi Ōyama, fueron asesores del juego móvil.
- **Primer juego de Pokémon diseñado desde cero para móviles.** La IA se entrenó simulando decenas de miles de partidas.
- **Crítica:** gustaba la estrategia. Se criticaba el pay-to-win, el peso de la suerte, las cargas lentas y los cuelgues, las esperas para las recompensas y los menús recargados.

## 2. Reglas básicas

### Tablero y equipo
- Cada jugador lleva 6 figuras y hasta 6 *plates* (cartas de objeto que se usan al principio del turno).
- Cada lado tiene una portería y dos casillas de entrada. Una figura colocada sobre una casilla de entrada la bloquea.
- El jugador que empieza se elige al azar.
- Se mueve una sola figura por turno.

### Cómo se gana
1. Mover una figura a la portería rival.
2. Que el rival no tenga ningún movimiento posible ("wait win").
3. Que al rival se le acabe el tiempo (5 min en multijugador).
4. Hay un límite de 300 turnos.

### Movimiento (MP)
- Cada figura avanza de 1 a 3 casillas.
- En su primer turno tiene −1 MP.
- No se puede saltar por encima de otras figuras.

### Combate con ruleta
Solo se puede atacar a una figura rival que esté al lado. Las dos figuras giran su ruleta y el resultado depende del color de la casilla en la que caen:

| Color | Qué es | Resultado |
|---|---|---|
| Blanco | Ataque con daño | Gana el de más daño; si empatan, no pasa nada |
| Dorado | Ataque prioritario con daño | Gana al morado |
| Morado | Efecto (veneno, ralentizar…) | Gana al blanco. Entre dos morados, ganan más estrellas ★ |
| Azul | Defensa (Protección, Esquivar…) | Gana a todo, pero normalmente no tiene efecto |
| Rojo | Fallo | Pierde contra cualquier otro |

### Derrotas
- **Rodear:** si rodeas a una figura con tus piezas, queda fuera de combate sin batalla.
- **Figuras derrotadas:** van al "PC". Caben como mucho 2; cuando entra una tercera, la más antigua vuelve al banquillo.

### Estados alterados

| Estado | Efecto |
|---|---|
| Confusión | La ruleta se desplaza una casilla |
| Veneno | −20 de daño |
| Veneno grave | −40 de daño |
| Parálisis | El ataque más débil pasa a ser fallo |
| Quemadura | Lo mismo que parálisis, y además −10 de daño |
| Sueño | No puede moverse ni atacar hasta que una figura aliada al lado la despierte |
| Congelación | Puede moverse, pero sus ataques fallan. Se quita tras una batalla |
| Espera (*Wait*) | No puede hacer nada durante X turnos |
| Maldición | Si la derrotan, sale de la partida para siempre |

Se curan con *plates*. El movimiento Z de tipo Planta quita todos los estados de tus figuras.

## 3. Mecánicas añadidas en actualizaciones (según Serebii)

### Evolución (v2)
- Se adjunta la figura evolucionada a la anterior en el mazo.
- Al ganar una batalla, la figura puede evolucionar.
- Cada evolución da +10 de daño y +1★ en cada ataque.

### Megaevolución (v5)
- Solo una por partida.
- Dura 7 turnos.
- Da un efecto a todo el equipo.

### Movimientos Z (v7)
- La barra Z se llena a lo largo de la partida.
- El efecto depende del tipo de la figura.
- Los movimientos Z blancos hacen el doble de daño del ataque más fuerte de la figura.

| Tipo | Color | Efecto (resumido) |
|---|---|---|
| Normal | Blanco | El rival derrotado vuelve al banquillo 7 turnos después |
| Lucha | Blanco | Pone una marca de "agrietado" a los rivales en línea detrás del objetivo |
| Volador | Blanco | Las figuras de al lado giran; las que sacan blanco vuelven al banquillo; el usuario queda en Espera 3 |
| Veneno | Blanco | Todas las figuras rivales giran; las que sacan blanco quedan envenenadas |
| Tierra | Morado | Deja fuera de combate al rival |
| Roca | Morado | El rival y las figuras rivales de al lado quedan en Espera 9 |
| Bicho | Blanco | Pone una marca de −2 MP a los rivales a 2 casillas o menos |
| Fantasma | Blanco | Todas las figuras rivales giran; las que sacan blanco reciben una marca de −1 MP |
| Acero | Blanco | Si derrota al rival, el usuario se mueve 2 casillas después de la batalla |
| Fuego | Blanco | Quema al rival y a la figura que tiene detrás |
| Agua | Blanco | Confunde al rival y a los rivales a 2 casillas o menos |
| Planta | Blanco | Quita todos los estados alterados de tus figuras |
| Eléctrico | Blanco | Paraliza al rival y a una cadena de figuras adyacentes |
| Psíquico | Blanco | El usuario se mueve 3 casillas después de la batalla |
| Hielo | Blanco | Congela a un rival a 2 casillas o menos |
| Dragón | Morado | Una figura gira; si saca fallo o un ataque blanco de 120 o más, queda fuera de combate |
| Siniestro | Blanco | Reduce la barra Z del rival en 2/3 de su máximo |
| Hada | Morado | Manda al rival al banquillo |

### Rarezas y mejora de figuras
- **Rarezas:** C, UC, R, EX y UX. UX es la de las figuras Mega; Bulbapedia tiene 84 figuras en esa categoría.
- **Fusión:** se fusionan figuras gastando monedas.
- **Niveles:** cada figura sube hasta nivel 5, y con *Carmonite* hasta nivel 10. Cada nivel da 1 punto para agrandar o encoger una casilla de la ruleta.
- **Chain Level:** sube fusionando copias iguales. Hacen falta 1 EX, 3 R, 9 UC o 30 C por nivel. Cada nivel da +1 de poder a un ataque.
- **Número de figuras:** 591 figuras distintas, con números que llegan hasta el 648 (hay números saltados). ⚠️ Es un conteo propio a partir del HTML de Serebii, no una cifra oficial.

## 4. Monetización
- Sobres tipo gacha que se compran con gemas.
- Los sobres que ganas jugando tardan 6 horas en poder abrirse.
- Las monedas se usan para fusionar figuras.
- Los desarrolladores pusieron un límite de gasto.
- En 2019 se pasó a un sistema de "Player Pass".
- Modo historia: el "Pokémon Figure World Championships" en la isla Carmonte, que gasta energía (1 punto cada 2 minutos).
- Modo online: clasificación Elo, con ranking general y mensual.

## 5. Situación actual (fan)
- **Kaeru Duel** (kaeru.world) es un servidor privado que mantiene vivo el juego en Android (y en PC con BlueStacks). En marzo de 2025 no había versión para iOS.
- En marzo de 2024 anunciaron que iban a hacer el código abierto. ⚠️ No he podido confirmar si llegaron a publicarlo.
- La wiki de r/pokemonduel recoge otros proyectos sucesores: un juego de cartas con dado de 24 caras y un sucesor digital.

## 6. Notas para nuestro proyecto (pendiente de decidir)
- *Pendiente:* qué mecánicas copiar tal cual y cuáles simplificar. Las que más complejidad añaden son movimientos Z, Mega y estados alterados.
- Sprites disponibles en `sprites/` (ver `README.md`).
- Ojo con la propiedad intelectual: Pokémon y sus sprites son de Nintendo, Game Freak y The Pokémon Company.

## Fuentes
- [Wikipedia – Pokémon Duel](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Duel)
- [Bulbapedia – Pokémon Duel](https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Duel)
- [Bulbapedia – figuras UX](https://bulbapedia.bulbagarden.net/wiki/Category:UX_rarity_figures)
- [Bulbapedia – Trading Figure Game](https://bulbapedia.bulbagarden.net/wiki/Trading_Figure_Game)
- [Serebii – Duel](https://serebii.net/duel/)
- [Serebii – mecánicas](https://serebii.net/duel/mechanics.shtml)
- [Serebii – figuras](https://serebii.net/duel/figures.shtml)
- [Pokémon.com – guía](https://www.pokemon.com/us/strategy/prime-yourself-for-pokemon-duels)
- [TechRaptor – cierre](https://techraptor.net/gaming/news/mobile-title-pokemon-duel-shutting-down-october-31st)
- [Reddit r/pokemonduel (Kaeru)](https://reddit.sudovanilla.org/r/pokemonduel/comments/1fosbhh/i_miss_this_game)
- [Wiki de sucesores de r/pokemonduel](https://nyc1.lr.ggtyler.dev/r/pokemonduel/wiki/successors)
