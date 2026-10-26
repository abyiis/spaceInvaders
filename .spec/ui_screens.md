# ui_screens.md — Pantallas de la app y navegación

> Estado: **v1.2**. Aplica a todas las pantallas HTML/CSS que se montan en `#ui` sobre el canvas. Los tiempos viven en `src/ui/uiConstants.js` y deben coincidir con la tabla de §11.

## 1. Alcance

Este documento define cuatro pantallas decididas por el equipo, el menú de pausa de la partida y el mecanismo de navegación que las une:

| Pantalla | Qué es | Tareas |
|---|---|---|
| **Splash** | Pantalla de arranque con la marca del juego. | 2B.3 |
| **Home** | Menú principal. Es la evolución del menú de la tarea 2.3, no una pantalla paralela. | 2B.4 |
| **Créditos** | Equipo y tecnologías. | 2B.5, 2B.6 |
| **Resultados** | Puntaje obtenido al terminar la partida. Sustituye al «GAME OVER» dibujado en el canvas. | 2B.7 – 2B.10 |
| **Menú de pausa** | Botón de pausa durante la partida, con «Continuar» y «Salir al inicio». | 2B.12 |

Lobby (tarea 2.6) y Ranking (tarea 2.9) usarán este mismo router cuando se implementen; su contenido se define en sus tareas, en `multiplayer_sync.md` y en `firebase_schema.md`.

El **splash nativo** de Android/iOS (tarea 4.4) es otra cosa: lo dibuja el sistema operativo antes de que cargue el WebView. El splash de este documento se muestra dentro de la app, ya cargada, y continúa la marca sin repetirla de forma larga (ver §11).

## 2. Flujo entre pantallas

```
arranque → SPLASH ──(2,5 s o toque tras 0,8 s)──→ HOME
                                                   │
        ┌───────────── Créditos ───────────────────┤
        ▼                                          │
     CREDITS ──Volver──→ HOME                      │
                                                   ├── Jugar solo ──→ PLAYING ──Game Over (+1,2 s)──→ RESULTS
                                                   ├── Crear / Unirse ──→ LOBBY      (tareas 2.6, 3.x)
                                                   └── Ranking ──→ RANKING           (tarea 2.9)

RESULTS ──Jugar de nuevo──→ PLAYING (solo)          RESULTS ──Inicio──→ HOME

PLAYING ──⏸ Pausa → Salir al inicio──→ HOME          (partida abandonada)
```

| Desde | Evento | Hacia | Notas |
|---|---|---|---|
| (arranque) | La app carga | `splash` | Una vez por arranque. Volver del segundo plano **no** repite el splash. |
| `splash` | Pasan 2,5 s, o toque/tecla tras 0,8 s | `home` | |
| `home` | «Jugar solo» | `playing` | Empieza una partida nueva (`startNewGame()`). |
| `home` | «Créditos» | `credits` | |
| `home` | «Crear sala», «Unirse a sala», «Ranking» | — | Hasta que existan sus pantallas, muestran un aviso «disponible pronto» (comportamiento actual de 2.3). |
| `credits` | «Volver» | `home` | |
| `playing` | Game Over | `results` | Tras 1,2 s (§8). |
| `playing` | Botón ⏸ y luego «Salir al inicio» | `home` | La partida se abandona: no hay resultado, ni ranking, ni récord (§9). |
| `results` | «Jugar de nuevo» | `playing` | Partida nueva. En coop será «Volver al lobby» (tarea 3.13). |
| `results` | «Inicio» | `home` | |

## 3. Reglas generales

1. Todas las pantallas se construyen con **HTML + CSS dentro de `#ui`**, nunca dibujadas en el canvas. Única excepción heredada: el aviso «PAUSA» de `game_loop.md` §7, que sigue en el canvas.
2. Hay **una sola pantalla activa**. `playing` es la pantalla de juego: `#ui` solo contiene el botón de pausa y su menú (§9); el resto lo dibuja el canvas, que recibe la entrada.
3. **Invariante de la simulación:** el juego solo avanza mientras la pantalla activa es `playing`. En cualquier otra pantalla el juego está en pausa (`paused`) o terminado (`isGameOver`). Por eso desmontar `playing` siempre llama a `game.pause()`.
4. Cada pantalla es una función `mount…(container, params, nav) → unmount`. Al cambiar de pantalla el router llama al `unmount` de la anterior, que **quita su DOM y sus listeners** (no se ocultan con CSS).
5. Capas: `ui/` puede importar `game/` y `net/`; `game/` **no** importa `ui/`. La UI se entera del juego por callbacks inyectados (§10). Las pantallas de `ui/` no importan `firebase/*` directamente.
6. Textos de la interfaz en español; nombres de código en inglés.
7. **Accesibilidad:**
   - Cada pantalla es una `<section>` con `aria-labelledby` apuntando a su título.
   - Al montarse, el foco va al botón principal (en el splash, a la propia sección).
   - Los botones son `<button type="button">`, con altura táctil de al menos 48 px y estado `:focus-visible` visible.
   - Texto claro sobre fondo oscuro con contraste mínimo 4,5:1.
   - Los mensajes de estado usan `role="status"` y `aria-live="polite"`.
8. **Zonas seguras:** el relleno de cada pantalla suma `env(safe-area-inset-*)` (muescas y barras del sistema).
9. **Movimiento:** la entrada de cada pantalla es un fundido de opacidad de 200 ms. Con `prefers-reduced-motion: reduce` se elimina el fundido y toda animación decorativa.
10. **Sin assets externos** (coherente con `architecture.md` §6): el logo es texto más un SVG en línea con la nave del jugador (`#4fc3f7`).
11. Los colores y medidas comunes se definen una vez como variables CSS en `src/style.css` y las pantallas las reutilizan; la paleta parte de la del menú actual (fondo `#0b0e1a`, acento `#536ce0`).

## 4. Router de pantallas (`src/ui/screenRouter.js`)

```js
/**
 * @typedef {(container: HTMLElement, params: object, nav: Router) => (() => void)} ScreenMount
 * @param {{
 *   container: HTMLElement,
 *   screens: Record<string, ScreenMount>,
 *   backTargets?: Record<string, string>,
 * }} options
 * @returns {{ show(name: string, params?: object): void, back(): boolean,
 *             readonly current: string | null, destroy(): void }}
 */
export function createScreenRouter(options) {}
```

| Miembro | Comportamiento |
|---|---|
| `show(name, params)` | Llama al `unmount` de la pantalla actual (si hay), monta la nueva con `params` y actualiza `current`. Si `name` no está registrada lanza un `Error` y **no** desmonta la actual. |
| `current` | Nombre de la pantalla activa, o `null` antes del primer `show`. |
| `back()` | Si `backTargets[current]` existe, hace `show` de ese destino y devuelve `true`; si no, devuelve `false` (el llamador decide qué hacer). |
| `destroy()` | Desmonta la pantalla actual y deja `current = null`. |

- Nombres registrados: `splash`, `home`, `credits`, `playing`, `results` (y más adelante `lobby`, `ranking`). Se exportan como constantes `SCREENS`.
- `backTargets` por defecto: `credits → home`, `results → home` (y más adelante `ranking → home`, `lobby → home`).
- El router no captura errores de las pantallas: un fallo al montar se propaga.
- El router no conoce el DOM salvo para pasar `container`: así se prueba en Node con un contenedor y pantallas falsas.

## 5. Splash

**Propósito:** presentar la marca al abrir la app.

- Contenido: nave (SVG en línea), título «SPACE COOP», lema «Arcade cooperativo» y una barra de carga **decorativa** (no refleja carga real).
- Dura **2,5 s** y pasa sola a `home`. Un toque, un clic o una tecla la omiten, pero **solo a partir de 0,8 s**, para que la marca llegue a verse.
- Se muestra una sola vez por arranque de la app.
- No importa Firebase ni hace trabajo de red: el modo solo debe poder empezar sin configuración (`architecture.md` §3, regla 5).
- Con `prefers-reduced-motion: reduce` no hay animación de la barra ni brillo, pero la pantalla se mantiene el mismo tiempo.
- El primer toque en el splash también desbloquea el audio (`architecture.md` §3.3), porque `main.js` escucha `pointerdown`/`pointerup`/`keydown` en `window`.
- La lógica de tiempo (avance automático y omisión tras 0,8 s) usa temporizadores inyectados para poder probarse en Node.

## 6. Home

**Propósito:** punto de partida y navegación. Es el menú principal de la tarea 2.3 adaptado al router.

- Contenido: lema «Arcade cooperativo», título «Space Coop», descripción «Defiende la galaxia. ¿Listo para jugar?» y los botones, en este orden:
  1. **Jugar solo** (principal).
  2. **Crear sala**.
  3. **Unirse a sala**.
  4. **Ranking**.
  5. **Créditos** (secundario, visualmente más discreto que los anteriores).
- «Jugar solo» → `playing`. «Créditos» → `credits`.
- «Crear sala», «Unirse a sala» y «Ranking» mantienen sus avisos en `role="status"` hasta que existan sus pantallas.
- Si existe un récord personal (§8.5) se muestra una línea «Tu récord: N» bajo la descripción.
- La implementación vive en `src/ui/mainMenu.js`; se adapta para devolver su función `unmount` y recibir las acciones por parámetro.

## 7. Créditos

**Propósito:** reconocer al equipo que hizo el juego.

- Secciones, en este orden:
  1. **Equipo:** los nombres de los integrantes, uno por línea.
  2. **Tecnologías:** HTML5 Canvas, JavaScript, Vite, Capacitor, Firebase.
  3. Nota final: «Sonidos y gráficos generados por código, sin recursos externos.»
- Botón **Volver** siempre visible (fijo al pie del panel) → `home`.
- Si el contenido no cabe en pantalla, el panel hace scroll vertical con `overscroll-behavior: contain`; el botón Volver no se desplaza.
- Los datos viven en `src/ui/creditsData.js`, para editarlos sin tocar la pantalla:

```js
export const CREDITS = {
  team: [
    { name: 'Juan Felipe Cano Noreña' },
    { name: 'Juan David Parra Sierra' },
    { name: 'Santiago Viana Ayala' },
  ],
};
```

- El equipo solo aportó los nombres: esta versión **no** muestra roles, curso, institución ni agradecimientos. Si más adelante se quieren, se añaden a `CREDITS` y a este documento.
- Una prueba comprueba la **forma** de los datos: `team` con al menos un integrante y cada `name` como texto no vacío.

## 8. Resultados

**Propósito:** mostrar el puntaje obtenido al terminar la partida y decidir qué sigue.

### 8.1 Modelo de datos

```js
/** @typedef {{ mode: 'solo' | 'coop', score: number, wave: number, durationSeconds: number }} GameResult */
```

- `score`: puntaje final (`game_loop.md` §5).
- `wave`: oleada en la que terminó la partida.
- `durationSeconds`: `Game.elapsed` al terminar, en segundos.
- `mode`: `'coop'` si `sync.isCoop`, si no `'solo'`.
- En coop (tarea 3.13) el modelo añade `players: { uid, name, kills }[]` (desglose por jugador, con las bajas oficiales del host), `localUid` e `isHost`.

### 8.2 Contenido (modo solo)

| Elemento | Texto / formato |
|---|---|
| Título | «Fin de la partida» |
| Puntaje (número grande) | `formatScore(score)`; punto como separador de miles desde 1.000 (`1250` → `1.250`) |
| Oleada | «Oleada alcanzada: N» |
| Tiempo | «Tiempo: mm:ss», con minutos sin tope (`205,4 s` → `03:25`; `4510 s` → `75:10`) |
| Récord (§8.5) | Insignia «¡Nuevo récord!» |
| Guardado (§8.4) | Línea de estado bajo los datos |
| Acción principal | Botón **Jugar de nuevo** |
| Acción secundaria | Botón **Inicio** |

`formatScore` y `formatDuration` son funciones **puras** con pruebas. No dependen del idioma del sistema ni de `Intl`, para que el resultado sea idéntico en Node, en el navegador y en el WebView.

### 8.3 Comportamiento

- **Aparece 1,2 s después del Game Over.** Durante ese tiempo el canvas muestra la escena congelada, sin texto, para que el jugador vea cómo terminó.
- Mientras tanto **no se reinicia la partida con toques ni teclas**: por eso `input.js` deja de reiniciar en Game Over (§10). Así un toque accidental al morir no se salta el puntaje.
- Al montarse, el foco va a **Jugar de nuevo**, de modo que Enter y Espacio lo activan de forma nativa.
- Se muestra solo si la pantalla activa sigue siendo `playing` cuando vence el retraso.
- **Jugar de nuevo** → `playing`; **Inicio** → `home`. El botón «Atrás» de Android equivale a Inicio (§12).
- La pantalla **no escribe en Firestore**: delega en una función `saveScore(result)` inyectada.

### 8.4 Estado de guardado (tarea 2B.9, depende de 2.8)

Solo se muestra si `main.js` entrega `saveScore` (Firebase configurado y tarea 2.8 hecha). Sin `saveScore`, la línea de estado no existe y el modo solo funciona sin red.

| Estado | Texto | Acción |
|---|---|---|
| Guardando | «Guardando puntaje…» | — |
| Guardado | «Puntaje guardado en el ranking» | — |
| Error | «No se pudo guardar el puntaje» | Botón **Reintentar** |

El guardado se lanza una sola vez al montar la pantalla; «Reintentar» lo repite. El resultado se corresponde con el documento de `leaderboard` de `firebase_schema.md` §2.

### 8.5 Récord personal local (tarea 2B.10)

- Se guarda en `localStorage` con la clave `spacecoop.bestScore`; no es un cambio del esquema de Firebase.
- Módulo `src/ui/bestScore.js`: `createBestScoreStore({ storage })` con `get()` y `submit(score) → { best, isNewBest }`. El almacenamiento se inyecta para probarlo en Node.
- Si `localStorage` falla o no existe, se ignora en silencio y no se muestra récord.
- Solo cuenta el modo solo y solo las partidas que terminan (una partida abandonada con «Salir al inicio» no cuenta).

### 8.6 Modo coop (tarea 3.13)

Con `mode: 'coop'` la pantalla muestra:

| Elemento | Texto / formato |
|---|---|
| Título | «Resultado del equipo» |
| Puntaje, oleada, tiempo | Igual que en solo (puntaje oficial del host) |
| Desglose | Una fila por jugador: nombre («(tú)» en el propio) y «N bajas» |
| Guardado | Solo en el host: «Guardando puntaje…» / «Puntaje guardado en el ranking» / «No se pudo guardar el puntaje» + **Reintentar**. El invitado ve «El host guarda el puntaje del equipo en el ranking.» |
| Acción | Botón **Volver al lobby** (no hay «Jugar de nuevo» ni «Inicio»): sale de la sala y vuelve al Home, desde donde se puede crear otra sala o unirse a una |

No hay récord personal en coop. Al salir de Resultados (por el botón o por «Atrás» de Android) el host borra la sala (`multiplayer_sync.md` §6, paso 6).

## 9. Menú de pausa y salida al Home

**Propósito:** pausar la partida a voluntad y poder salir al Home sin terminarla.

- **Botón de pausa** (⏸, `aria-label="Pausar"`, de al menos 44 × 44 px) en la esquina superior derecha del área de juego. Es HTML dentro de `#ui`, alineado con el canvas; el HUD de texto sigue dibujado en el canvas, arriba a la izquierda. La tecla **Esc** o **P** hace lo mismo.
- Al pulsarlo: `game.pause()` y aparece el **menú de pausa**, una superposición con el mismo fondo que los demás menús, con el título «Pausa» y dos botones:
  1. **Continuar** (principal, recibe el foco): cierra el menú y llama a `game.resume()`.
  2. **Salir al inicio**: va a `home`.
- **Salir al inicio abandona la partida:** no se llama a `onGameOver`, no hay pantalla de Resultados, no se guarda nada en el ranking y no cuenta para el récord. Para evitar salidas accidentales hacen falta dos pasos (⏸ y luego «Salir al inicio»).
- Mientras el menú está abierto **el input del juego está desactivado** (se quita y se vuelve a enganchar al continuar), de modo que Espacio/Enter solo activan el botón enfocado y no reanudan el juego por detrás.
- **Pausa por segundo plano** (`attachLifecycle`): no cambia. El canvas muestra «PAUSA · Toca para continuar» y un toque reanuda. Si el jugador abre el menú, manda el menú.
- El botón se oculta cuando la partida termina (`isGameOver`), para no interferir con los 1,2 s previos a Resultados.
- **Coop:** `pause()` no aplica en coop (`architecture.md` §3.2). Ahí el botón será «Salir», con la confirmación «¿Salir de la partida?», y abandonará la sala. Se define en la tarea 3.16; hasta entonces el botón no se muestra en coop.
- La lógica vive en `src/ui/pauseController.js`, con el juego y el enganche del input inyectados, para probarla en Node: `open()`, `resume()` y `exit()`.

| Elemento | Texto |
|---|---|
| Botón de pausa (accesibilidad) | «Pausar» |
| Título del menú | «Pausa» |
| Botones | «Continuar», «Salir al inicio» |

## 10. Integración con el juego

Esto es lo que cambia en `game/` y en el arranque (detalle en `game_loop.md` §7.1 y `architecture.md` §3.5):

1. `Game` acepta la opción `onGameOver(result)` (por defecto una función vacía). Se llama **una sola vez** desde `triggerGameOver()` con un `GameResult`. `startNewGame()` la rearma.
2. `main.js` conecta las piezas: al recibir `onGameOver` programa `router.show('results', { result })` tras `RESULTS_DELAY_MS`.
3. Se elimina el texto «GAME OVER / Puntaje / Toca para reiniciar» del canvas (`#renderGameOver`). Se mantiene el oscurecimiento de la escena congelada.
4. `input.js` **ya no reinicia** al toque ni con Espacio/Enter cuando `isGameOver`. El reinicio es solo por el botón «Jugar de nuevo».
5. **El input del juego solo está activo en `playing`:** se engancha (`attachInput`) al montar esa pantalla y se quita con la función que devuelve al desmontarla. Motivo: `input.js` escucha Espacio/Enter en `window`; si siguiera enganchado, pulsar Enter sobre un botón del Home reanudaría el juego por detrás del menú.
6. Montar `playing` llama a `game.startNewGame()`, que deja `paused = false` y reinicia el estado, y crea el botón de pausa (§9). Desmontarla quita el botón y el input y llama a `game.pause()`. Al arrancar la app el juego se crea y se pausa, como ahora.
7. `attachLifecycle` (`architecture.md` §3.2) no cambia: pausar en segundo plano sigue funcionando y reanudar sigue siendo manual con un toque en el canvas.

## 11. Tiempos y constantes (`src/ui/uiConstants.js`)

| Constante | Valor | Uso |
|---|---|---|
| `SPLASH_DURATION_MS` | 2500 | Duración del splash |
| `SPLASH_SKIP_AFTER_MS` | 800 | Desde cuándo se puede omitir el splash |
| `RESULTS_DELAY_MS` | 1200 | Espera entre el Game Over y Resultados |
| `SCREEN_FADE_MS` | 200 | Fundido de entrada de una pantalla |
| `BEST_SCORE_STORAGE_KEY` | `'spacecoop.bestScore'` | Clave del récord local (§8.5) |

Presupuesto de arranque: el splash nativo (tarea 4.4) debe durar **1 s o menos** y el splash de la app 2,5 s, de modo que el Home aparezca en **3,5 s o menos** desde que se toca el ícono.

## 12. Botón «Atrás» de Android (tarea 2B.11)

Se escucha el evento `backButton` del plugin `@capacitor/app` (ya es dependencia; no se añade ninguna). Al registrar un listener, Capacitor deja de cerrar la app por sí solo, así que el cierre hay que pedirlo explícitamente.

| Pantalla activa | Acción |
|---|---|
| `splash` | Se ignora |
| `home` | Cierra la app (`App.exitApp()`) |
| `credits`, `results` | Vuelve a `home` (`router.back()`) |
| `playing` | Abre el menú de pausa (§9) en solo; en coop se ignora hasta la tarea 3.16 |

El mapa de destinos es lógica pura y se prueba en Node con el plugin inyectado, igual que `attachLifecycle`.

## 13. Pruebas esperadas

**Unitarias (`node --test`, sin navegador):**

- Router: monta y desmonta en orden; `current` correcto; nombre desconocido lanza error y conserva la pantalla actual; `params` llegan a la pantalla; `back()` respeta `backTargets` y devuelve `false` si no hay destino; `destroy()` desmonta.
- `formatScore`: `0`, `999`, `1000`, `1250`, `1234567`.
- `formatDuration`: `0`, `59.9`, `60`, `205.4`, `4510`.
- `Game.onGameOver`: se llama una vez con `{ mode, score, wave, durationSeconds }`; no se repite en `update()` posteriores ni al llamar otra vez a `triggerGameOver()`; se rearma tras `startNewGame()`; `mode` es `'coop'` con un gateway cuyo `isCoop` es `true`.
- Splash: avance automático a 2,5 s; la omisión antes de 0,8 s se ignora y después funciona (temporizadores inyectados).
- Forma de `CREDITS` (§7): al menos un integrante y cada `name` no vacío.
- Menú de pausa (`pauseController`): `open()` pausa el juego y quita el input; `resume()` reanuda y lo vuelve a enganchar; `exit()` llama a la salida y **no** dispara `onGameOver`; `open()` no hace nada tras el Game Over ni en coop.
- Récord local: primera partida, récord superado, puntaje menor, `storage` que lanza.
- Mapa de destinos del botón «Atrás».

**Manuales:**

- Flujo completo en el navegador a 360×640 y a 320×568: splash → home → créditos → home → jugar → morir → resultados → jugar de nuevo → morir → resultados → inicio.
- El mismo flujo en el emulador o teléfono Android (WebView).
- Con teclado: Tab recorre los botones, Enter los activa, el foco siempre es visible.
- Con «Reducir movimiento» activado en el sistema: sin fundidos ni animaciones.
- Mientras se muestra un menú (Home, Créditos, Resultados o Pausa), pulsar Enter o Espacio **no** reanuda el juego por detrás.
- Pausa → «Continuar» devuelve la partida tal como estaba; pausa → «Salir al inicio» lleva al Home y «Jugar solo» empieza una partida nueva.

## 14. Criterios de aceptación

- Al abrir la app se ve el splash, y a los 2,5 s (o con un toque pasados 0,8 s) aparece el Home.
- Desde el Home se llega a Créditos y se vuelve; «Jugar solo» empieza una partida nueva.
- Al perder la última vida, tras 1,2 s aparece Resultados con el puntaje, la oleada y el tiempo **correctos**.
- Un toque o una tecla durante esos 1,2 s no reinicia la partida.
- «Jugar de nuevo» arranca una partida limpia (puntaje 0, 3 vidas, oleada 1); «Inicio» vuelve al Home.
- Durante la partida se puede pausar con el botón ⏸ (o Esc/P) y salir al Home; esa partida no produce resultado.
- El juego no avanza detrás de ninguna pantalla.
- `npm test` pasa y `npm run build` termina sin errores.
- El modo solo funciona sin Firebase configurado.

## 15. Supuestos y puntos abiertos

Confirmados por el equipo el 2026-10-22, salvo los marcados como pendientes:

1. **Home = menú de la tarea 2.3 adaptado**, no una pantalla nueva. *(Confirmado.)*
2. **El fondo de estrellas no se anima detrás de los menús:** el juego está en pausa fuera de `playing` (§3, regla 3). Animarlo exigiría que `Game` actualice el fondo en pausa; puede añadirse después. *(Confirmado.)*
3. **Créditos:** solo los nombres de los tres integrantes. *(Confirmado.)*
4. **Récord personal (§8.5) y botón «Atrás» (§12):** se quieren tener; pasan a prioridad P1. *(Confirmado.)*
5. **Salir al Home a mitad de partida:** sí, mediante el botón de pausa (§9). Abandonar no guarda resultado. *(Confirmado.)*
6. **Pendiente:** si una partida abandonada debería poder guardarse en el ranking. Por ahora no.
7. **Coop:** Resultados reserva el caso, pero su contenido se define en la tarea 3.13; la salida de una partida coop, en la 3.16.