# game_loop.md — Lógica del arcade infinito

> Estado: **v1.0**. Valores numéricos viven en `src/core/constants.js` y deben coincidir con las tablas de este documento.

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
| `input` (`src/game/input.js`) | pantalla completa | Captura arrastre/toques (Pointer Events) y teclado; los reenvía al juego. |

## 3. Ciclo por frame (`update(dt)`)

1. Si `isGameOver`, no se actualiza la simulación (solo se espera toque para reiniciar).
2. `Player`: aplica cooldown de disparo y de invulnerabilidad.
3. `Formation`: mueve enemigos; si algún enemigo toca el borde lateral, invierte dirección y baja un escalón.
4. `Formation`: temporizador de disparo enemigo.
5. Colisiones AABB (`src/core/collision.js`): resuelve bala↔enemigo y bala↔jugador.
6. Fin de oleada: si no quedan enemigos vivos → `onWaveCleared()`.
7. Fin de partida: vidas ≤ 0 o enemigo con `y ≥ playerLineY`.

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
                         └──→ resultados → LOBBY   (coop)
```

## 8. Pruebas esperadas (unitarias, sin navegador, con `node --test`)

- `waveParams(w)` devuelve los valores de la tabla del punto 4 para w = 1, 4, 10, 50.
- Los topes se respetan para w muy grande.
- La puntuación acumulada es la suma esperada tras N kills y M oleadas.

> Implementar `waveParams` como función pura en `src/core/difficulty.js` (Tarea 1.7) para poder probarla sin motor gráfico.
