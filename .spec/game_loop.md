# game_loop.md — Lógica del arcade infinito

> Estado: **v1.5**. Valores numéricos viven en `src/core/constants.js` o en el controlador de la mecánica correspondiente y deben coincidir con las tablas de este documento.

## 0. Resolución lógica

El juego usa un lienzo lógico **fijo de 360 × 640** (relación 9:16). El `<canvas>` se escala por CSS para ajustarse a la pantalla, y las coordenadas de puntero se convierten a coordenadas lógicas. Todas las medidas de este documento están en píxeles lógicos.

## 1. Concepto

El juego encadena **oleadas** (waves) indefinidamente. Cada oleada normal es más rápida y difícil que la anterior. Al completar cada tercera oleada aparece un jefe antes de la siguiente formación normal. La partida termina cuando el jugador queda sin vidas o los dos pilotos cooperativos quedan eliminados.

## 2. Entidades

| Entidad | Tamaño (px lógicos) | Comportamiento |
|---|---|---|
| `Player` | 36 × 28 | Se mueve solo en horizontal (arrastre del dedo). Dispara automáticamente cada 0,35 s. En solo, tras recibir daño tiene 1,5 s de invulnerabilidad; en coop, entra en emergencia durante 5 s. |
| `Enemy` | 28 × 20 | Forma parte de una `Formation`; incluye kamikazes y naves soporte. 1 punto de vida en las oleadas 1-4; 2 puntos desde la oleada 5 (en filas pares). |
| `Boss` | Variable | Aparece tras completar las oleadas 3, 6, 9…; tiene salud proporcional a la ronda, dos fases y diseños alternados. Mientras está activo no se generan enemigos normales. |
| `Bullet` | 4 × 12 | Del jugador (sube) o enemiga (baja). Se elimina al salir de pantalla o al colisionar. |
| `Formation` | — | Controlador (no visible) que mueve el grupo de enemigos, gestiona disparos enemigos y detecta fin de oleada. Su movimiento es una función pura del tiempo de oleada (§4.1). |
| `PowerUp` | 16 × 16 | Recogible que cae al destruir un enemigo con 6 % de probabilidad. El jefe derrotado otorga dos potenciadores distintos de inmediato; la fase bonus puede soltar Sobrecarga, que duplica el daño temporalmente. |
| `Hazards` | — | Alterna eventos temporales de asteroides, campo magnético y oscuridad. |
| `BonusStage` | — | Oleadas inofensivas de naves rápidas durante 15 s después de cada cinco rondas completadas. |
| `Starfield` | pantalla completa | Fondo decorativo de estrellas en parallax (ver §3.4). No participa en colisiones ni en la red. |
| `input` (`src/game/input.js`) | pantalla completa | Captura arrastre/toques (Pointer Events) y teclado; los reenvía al juego. |

## 3. Ciclo por frame (`update(dt)`)

1. Si `isGameOver` o `paused`, no se actualiza la simulación (en Game Over se espera un toque para reiniciar; en pausa, un toque para continuar).
2. `Starfield`: desplaza las estrellas hacia abajo (§3.4).
3. `Player`: aplica cooldown de disparo y de invulnerabilidad.
4. `Hazards`: temporizadores y colisiones de asteroides; el campo magnético curva los disparos del jugador.
5. Si hay jefe activo, `Boss` mueve, ataca y recibe curación de su nave soporte; durante el bonus, las formaciones normales quedan detenidas.
6. Colisiones: resuelve sinergia entre disparos cooperativos, bala↔enemigo/jefe/jugador, asteroide↔nave/enemigo y recogida de potenciadores.
7. Si no quedan enemigos normales, se concede el bonus de oleada; cada ronda múltiplo de 3 inicia jefe y cada múltiplo de 5 programa una fase bonus. En coop solo el host decide estas transiciones y las anuncia con un evento `phase`; el compañero las sigue (`multiplayer_sync.md` §4.3).
8. En rondas que son múltiplos de 15, se derrota primero al jefe y luego se juega la fase bonus. En las rondas 5, 10, 20… la fase bonus comienza directamente.
9. Al derrotar al jefe se concede una vida y dos potenciadores aleatorios distintos.
10. Fin de partida: vidas ≤ 0 en solo, ambos jugadores eliminados en coop o enemigo normal con `y ≥ playerLineY`. En coop lo decide el host y lo anuncia con `game-over` (puntaje y oleada oficiales).

### 3.1 Jefes

- Las rondas normales 3, 6, 9… son seguidas por un jefe antes de avanzar a la siguiente ronda normal.
- Salud máxima: `8 · ronda` (24 en la ronda 3, 48 en la 6, etc.). La barra muestra diseño, fase y salud restante.
- Fase 1 (salud ≥ 50 %): movimiento horizontal en la parte superior y un proyectil vertical periódico.
- Fase 2 (salud < 50 %): aumenta la velocidad, cambia el color y escoge aleatoriamente entre disparo en abanico, proyectil dirigido al jugador y ráfaga.
- Los diseños visuales alternan entre Vanguard, Dreadnought y Specter.
- Una nave soporte visible sigue al jefe, regenera 1 punto cada 3 s y puede destruirse con 3 impactos.
- Derrotar al jefe suma `100 · número de jefe` puntos, concede una vida y activa inmediatamente dos potenciadores distintos elegidos al azar. Los proyectiles enemigos restantes se eliminan.

### 3.2 Peligros ambientales

- Un evento comienza cada 20-36 s y dura 8-13 s; la selección aleatoria incluye lluvia de asteroides, campo magnético y oscuridad.
- La lluvia crea asteroides cada 0,55 s. Cada impacto destruye la roca y puede quitar una vida al jugador o destruir un enemigo.
- El campo magnético desvía gradualmente los proyectiles de jugador cercanos a su zona visible; no afecta proyectiles enemigos.
- En oscuridad se ocultan las estrellas y la escena queda negra, con un halo de luz alrededor de las entidades.

### 3.3 Enemigos especiales y fase bonus

- Desde la ronda 2 aparece un kamikaze, que abandona la formación, persigue al jugador activo más cercano y se destruye al embestir o salir de pantalla.
- Desde la ronda 3 aparece una nave soporte: cada 2,8 s protege hasta 3 enemigos durante 2,4 s; el escudo absorbe un impacto. Puede destruirse como cualquier enemigo.
- La fase bonus dura 15 s y crea naves que cruzan la pantalla cada 0,8 s; no disparan ni dañan al jugador. Cada nave destruida suma 50 puntos; cada tercera baja consecutiva aumenta el multiplicador hasta ×5. La probabilidad de caída de potenciador es 30 % y puede incluir Sobrecarga.

### 3.4 Fondo de estrellas en parallax (v1.2)

- Tres capas de estrellas que caen en vertical a distinta velocidad: las lejanas son pequeñas, tenues y lentas; las cercanas, más grandes, brillantes y rápidas. La diferencia de velocidad produce la sensación de profundidad.

| Capa | Estrellas | Velocidad (px/s) | Tamaño (px) | Opacidad |
|---|---|---|---|---|
| Lejana | 30 | 12 | 1 | 0,35 |
| Media | 18 | 28 | 1,5 | 0,6 |
| Cercana | 8 | 60 | 2 | 0,9 |

- Cada estrella nace en una posición aleatoria del lienzo. Al salir por abajo reaparece arriba con una `x` nueva, así el campo es continuo.
- Es solo decoración y **no usa `Game.random`**: tiene su propio generador (`starsRandom`, por defecto `Math.random`), de modo que no altera la secuencia de azar de la partida ni, en coop, la sincronización entre dispositivos. Cada cliente puede ver un fondo distinto.
- Se mueve únicamente cuando la simulación avanza: en pausa y en Game Over queda quieto. Se dibuja primero, detrás de enemigos, balas y nave, y debajo del HUD.
- Los valores viven en `src/core/constants.js` (`STAR_LAYERS`).

## 4. Fórmulas de dificultad (oleada `w`, empieza en 1)

### 4.1 Movimiento de la formación (v1.5)

El desplazamiento de la rejilla es una **función pura** del tiempo `t` desde el inicio de la oleada (`formationOffset`, `src/core/formationPath.js`), no una integración frame a frame: así dos clientes coop con el mismo `t` colocan igual a todos los enemigos (`multiplayer_sync.md` §3).

- La rejilla parte centrada. Recorre `range / 2` hasta la primera pared y, a partir de ahí, `range` entre paredes; en cada rebote baja `FORMATION_STEP_DOWN` (14 px).
- `range = ancho − 2·FORMATION_SIDE_MARGIN − anchoRejilla` (108 px con 6 columnas en 360 px) y el recorrido usa siempre los límites de la **rejilla completa**: matar enemigos de los extremos ya no adelanta el rebote.
- La velocidad es `speed(w)` de la tabla siguiente. Los kamikazes en picado salen de la rejilla y se mueven por su cuenta; abandonan la formación cuando `t ≥ 4 + (id mod 4)·1,2 s`.

| Parámetro | Fórmula | Tope |
|---|---|---|
| Filas | `min(3 + (w - 1) ~/ 3, 6)` | 6 |
| Columnas | 6 | — |
| Velocidad horizontal (px/s) | `min(40 + 8·(w-1), 160)` | 160 |
| Escalón vertical (px) | 14 | — |
| Intervalo medio de disparo enemigo (s) | `max(1.4 - 0.08·(w-1), 0.45)` | mín 0,45 |
| Velocidad bala enemiga (px/s) | 180 | — |
| Velocidad bala jugador (px/s) | 420 | — |

## 5. Puntuación

- Enemigo destruido: **+10** puntos.
- Oleada completada: **+50 · w** puntos de bonus.
- Nave bonus destruida: **+50 · multiplicador de combo**.
- Puntaje en coop: **un solo puntaje de equipo**.

## 6. Vidas

- Solo: 3 vidas.
- Coop: 3 vidas compartidas. Un impacto deja la nave en emergencia durante 5 s; el compañero puede acercarse y gastar 1 vida compartida para reanimarla. Si el contador ya está en 0, no se puede rescatar. Si vence el temporizador, esa nave queda eliminada; la partida termina cuando ambas naves quedan eliminadas o los enemigos alcanzan la línea.
- En coop se sincronizan posiciones, disparos, bajas, reanimaciones y pérdidas de vidas mediante los eventos de la sala.

## 7. Estados del juego

```
LOBBY → PLAYING → GAME_OVER → (toque) → PLAYING   (solo)
           │  ▲              └──→ resultados → LOBBY   (coop)
  segundo  │  │ toque / Espacio / Enter
  plano    ▼  │
          PAUSED                                     (solo; ver architecture.md §3.2)
```

`PAUSED` solo existe en modo solo y nunca desde `GAME_OVER`. Mientras dura, la simulación está congelada (incluidos temporizadores de invulnerabilidad y de disparo).

## 8. Pruebas esperadas (unitarias, sin navegador, con `node --test`)

- `waveParams(w)` devuelve los valores de la tabla del punto 4 para w = 1, 4, 10, 50.
- Los topes se respetan para w muy grande.
- La puntuación acumulada es la suma esperada tras N kills y M oleadas.

> Implementar `waveParams` como función pura en `src/core/difficulty.js` (Tarea 1.7) para poder probarla sin motor gráfico.