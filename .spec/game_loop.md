# game_loop.md — Lógica del arcade infinito

> Estado: **v1.2**. Valores numéricos viven en `src/core/constants.js` y deben coincidir con las tablas de este documento.

## 0. Resolución lógica

El juego usa un lienzo lógico **fijo de 360 × 640** (relación 9:16). El `<canvas>` se escala por CSS para ajustarse a la pantalla, y las coordenadas de puntero se convierten a coordenadas lógicas. Todas las medidas de este documento están en píxeles lógicos.

## 1. Concepto

Sin niveles. El juego encadena **oleadas** (waves) indefinidamente. Cada oleada es más rápida y más difícil que la anterior. La partida termina cuando el jugador (o el equipo, en coop) se queda sin vidas o los enemigos alcanzan la línea del jugador.

## 2. Entidades

| Entidad | Tamaño (px lógicos) | Comportamiento |
|---|---|---|
| `Player` | 36 × 28 | Se mueve solo en horizontal (arrastre del dedo). Dispara automáticamente cada 0,35 s. Tras recibir daño tiene 1,5 s de invulnerabilidad (parpadeo). |
| `Enemy` | 28 × 20 | Forma parte de una `Formation`. 1 punto de vida en las oleadas 1-4; 2 puntos desde la oleada 5 (en filas pares). |
| `Bullet` | 4 × 12 | Del jugador (sube) o enemiga (baja). Se elimina al salir de pantalla o al colisionar. |
| `Formation` | — | Controlador (no visible) que mueve el grupo de enemigos, gestiona disparos enemigos y detecta fin de oleada. |
| `Starfield` | pantalla completa | Fondo decorativo de estrellas en parallax (ver §3.1). No participa en colisiones ni en la red. |
| `input` (`src/game/input.js`) | pantalla completa | Captura arrastre/toques (Pointer Events) y teclado; los reenvía al juego. |

## 3. Ciclo por frame (`update(dt)`)

1. Si `isGameOver` o `paused`, no se actualiza la simulación (en Game Over se espera un toque para reiniciar; en pausa, un toque para continuar).
2. `Starfield`: desplaza las estrellas hacia abajo (§3.1).
3. `Player`: aplica cooldown de disparo y de invulnerabilidad.
4. `Formation`: mueve enemigos; si algún enemigo toca el borde lateral, invierte dirección y baja un escalón.
5. `Formation`: temporizador de disparo enemigo.
6. Colisiones AABB (`src/core/collision.js`): resuelve bala↔enemigo y bala↔jugador.
7. Fin de oleada: si no quedan enemigos vivos → `onWaveCleared()`.
8. Fin de partida: vidas ≤ 0 o enemigo con `y ≥ playerLineY`.

### 3.1 Fondo de estrellas en parallax (v1.2)

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
- Puntaje en coop: **un solo puntaje de equipo** (suma de ambos). El desglose individual se guarda como estadística.

## 6. Vidas

- Solo: 3 vidas.
- Coop: 3 vidas **por jugador**. Un jugador sin vidas queda como espectador; la partida termina cuando **ambos** están sin vidas o los enemigos alcanzan la línea.

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