# architecture.md — Arquitectura general

> Estado: **v1.7 (fuente de verdad)**. Si el código y este documento difieren, se corrige primero el documento y luego el código (SDD).
>
> Nota de mantenimiento: el commit `d5ec5fe` sobrescribió por error este archivo con el contenido de `ui_screens.md`; se restauró la v1.4 y se reaplicaron las v1.5 y v1.6 del changelog de `TASKS.md`.

## 1. Objetivo

Juego móvil estilo Space Invaders, arcade infinito por puntuación, con modo cooperativo en tiempo real de 2 jugadores (extensible a 4) sobre Firebase. Aplicación **híbrida**: se programa con HTML, CSS y JavaScript y se empaqueta como app instalable (Android/iOS) con Capacitor.

## 2. Stack

| Capa | Tecnología | Motivo |
|---|---|---|
| Juego | HTML5 `<canvas>` 2D + JavaScript (ES modules), sin librería de juegos | Space Invaders no requiere un motor; menos dependencias y lógica fácil de probar en Node. |
| Interfaz (menú, lobby, ranking, resultados) | HTML + CSS sobre el canvas | Pantallas estándar con CSS; aprovecha el carácter híbrido. |
| Empaquetado híbrido | **Capacitor** (WebView nativo) | Genera proyectos Android Studio / Xcode con el mismo código web. |
| Ciclo de vida de la app | `@capacitor/app` (evento `appStateChange`) | Plugin oficial de Capacitor para saber cuándo la app pasa a segundo plano en Android/iOS. En el navegador se usa además `visibilitychange`. Añadido en v1.2 (tarea 1.11). |
| Sonido | Web Audio API (sintetizado, sin archivos) | Sin assets ni dependencias; funciona igual en navegador y WebView. Añadido en v1.3 (tarea 1.12). |
| Vibración | `@capacitor/haptics` (cae a `navigator.vibrate` en navegador) | `navigator.vibrate` no existe en iOS; el plugin cubre Android e iOS y declara por sí mismo el permiso `VIBRATE`. Añadido en v1.3 (tarea 1.12). |
| Pantalla de arranque nativa | `@capacitor/splash-screen` | Splash del sistema de ≤ 1 s mientras carga el WebView (`capacitor.config.json`); ícono y splash se generan con `npm run assets`. Añadido en v1.7 (tarea 4.4). |
| Orientación | `@capacitor/screen-orientation` | Bloquea la app en vertical en Android/iOS (`src/orientation.js`); en el navegador no hace falta. Añadido en v1.7 (tarea 4.1). |
| Build y servidor de desarrollo | Vite | Recarga en vivo y bundle para `dist/`. |
| Estado de partida en vivo | Firebase Realtime Database (RTDB) | Baja latencia y facturación por ancho de banda, no por operación. |
| Datos de baja frecuencia | Cloud Firestore | Ranking global y perfiles. |
| Identidad | Firebase Auth (anónima) | Entrar sin registro. |
| SDK | Firebase JS SDK modular (`firebase/app`, `firebase/auth`, `firebase/database`, `firebase/firestore`) | Funciona igual en navegador y en el WebView de Capacitor. |
| Pruebas | `node --test` (runner integrado de Node) | Sin dependencias; la lógica de juego no toca el DOM. |

Plan objetivo: **Spark (gratis)**. Restricción relevante: máximo 100 conexiones simultáneas en RTDB.

## 3. Capas y dependencias

```
index.html                    # contenedor: <canvas> + capas de UI
src/
├── main.js                   # arranque, bucle requestAnimationFrame, enlace con el DOM
├── lifecycle.js              # pausa al pasar a segundo plano (visibilitychange + appStateChange)
├── effects.js                # sonido (Web Audio) y vibración: implementa el puerto Effects
├── style.css                 # estilos globales y de pantallas (tokens CSS comunes)
├── core/                     # lógica pura, sin DOM ni Firebase
│   ├── constants.js
│   ├── difficulty.js         # waveParams(w)
│   └── collision.js          # AABB
├── game/                     # simulación del juego
│   ├── Game.js               # estado, oleadas, colisiones, render(ctx)
│   ├── SyncGateway.js        # puerto de red (typedef) + NoopSyncGateway
│   ├── CoopGateway.js        # implementación coop del puerto (usa un roomRepository inyectado)
│   ├── Effects.js            # puerto de sonido/vibración (typedef) + NoopEffects
│   ├── Starfield.js          # fondo de estrellas en parallax (decorativo, v1.4)
│   ├── Player.js  Enemy.js  Bullet.js  Formation.js
│   ├── Boss.js  BonusStage.js  Hazards.js  powerUps.js
│   └── input.js              # Pointer Events + teclado (único módulo game/ que toca el DOM)
├── net/                      # acceso a Firebase tras interfaces
│   ├── firebase.js           # init + exports
│   ├── authService.js  profileRepository.js  scoreRepository.js
│   └── roomRepository.js     # salas, presencia, posiciones y eventos en RTDB
└── ui/                       # pantallas HTML/CSS y navegación
    ├── screenRouter.js  uiConstants.js  pauseController.js  backButton.js  bestScore.js
    ├── mainMenu.js  lobby.js  ranking.js  creditsData.js  firebaseErrorMessage.js
    └── screens/              # splash, credits, results, playing
test/                         # pruebas con node:test
firebase/                     # reglas de seguridad
capacitor.config.json
```

Reglas de dependencia (obligatorias):

1. `core/` no importa nada del proyecto ni del DOM.
2. `game/` (salvo `input.js`) **no** usa `window`/`document` en `update()`; el método `render(ctx)` recibe el contexto 2D como parámetro. Esto permite probar la simulación en Node.
3. `game/` **no** importa `firebase/*`. Se comunica con `net/` mediante una interfaz `SyncGateway` inyectada (`NoopSyncGateway` en modo solo).
4. `net/` no importa `ui/`; `ui/` puede importar `net/` y `game/`.
5. El modo individual debe funcionar sin Firebase configurado.
6. `game/` **no** importa `ui/`: la UI se entera del juego por callbacks inyectados (p. ej. `onGameOver`).

### 3.1 Puerto `SyncGateway` (v1.1)

`game/` nunca habla con Firebase: notifica sus eventos locales a un objeto `SyncGateway` que recibe por el constructor (`new Game({ sync })`). El puerto vive en `src/game/SyncGateway.js` (la capa que lo usa es la dueña del contrato) y `net/syncService.js` lo implementará en la Fase 3 sin que `game/` importe `net/`. Por defecto `Game` usa `NoopSyncGateway`, que no hace nada: así el modo solo funciona sin Firebase.

| Miembro | Cuándo lo llama `Game` | Origen en `multiplayer_sync.md` |
|---|---|---|
| `isCoop: boolean` | — (solo lectura; `false` en el Noop) | §6 |
| `publishPlayerX(x: number)` | Cada frame, con `x` normalizado 0..1. Solo entrega el valor: el gateway real conserva el último y un temporizador de 100 ms hace el `update()` parcial, solo si cambió más de 0,002. | §4.1 |
| `emitShot(t: number, x: number)` | El jugador dispara (`t` = segundos de juego, `x` normalizado). | §4.2 `shot` |
| `emitKill(wave: number, enemyId: number, t: number)` | Un impacto local destruye a un enemigo. | §4.2 `kill` |
| `emitHit(t: number)` | La nave local pierde una vida. | §4.2 `hit` |
| `dispose()` | Se abandona la partida. Cancela suscripciones y temporizadores. | `firebase_schema.md` §4.4 |

Notas:
- `enemyId` = índice del enemigo en su oleada (`row * columns + col`); es estable entre clientes porque la rejilla es determinista.
- `t` es `Game.elapsed` (segundos de juego acumulados desde `startNewGame()`). En coop la Fase 3 lo sustituirá por el reloj del servidor (`multiplayer_sync.md` §2).
- El sentido entrante (eventos del compañero, `killed`, `lives`) **no** forma parte de esta versión del puerto; se añadirá en las tareas 3.6-3.10 y se anotará en el changelog.

### 3.2 Pausa y ciclo de vida (v1.2)

- `Game` expone `paused`, `pause()` y `resume()`. Mientras `paused` es `true`, `update(dt)` no avanza nada (ni `elapsed`, ni enemigos, ni balas, ni cooldowns) y `render(ctx)` dibuja la partida congelada con el aviso «PAUSA · Toca para continuar».
- `pause()` no hace nada si la partida ya terminó ni si `sync.isCoop` es `true`: en coop la simulación depende del reloj del servidor y una pausa local la desincronizaría. En coop el segundo plano se trata con los avisos de conexión (tarea 3.12).
- `startNewGame()` siempre deja `paused = false`.
- `src/lifecycle.js` exporta `attachLifecycle(game, { doc, app })`. Es código de enlace como `main.js` (puede tocar el DOM y recibir el plugin de Capacitor); `game/` nunca lo importa. Pausa cuando:
  1. `document.visibilityState === 'hidden'` (evento `visibilitychange`), o
  2. el plugin `App` emite `appStateChange` con `isActive === false`.
  Devuelve una función que quita los listeners. `app` se inyecta (en `main.js` es `App` de `@capacitor/app`) para poder probarlo en Node sin el plugin.
- **Reanudar es siempre manual**: al volver a la app el juego sigue en pausa hasta que el jugador toca la pantalla o pulsa Espacio/Enter (`input.js`). Así la partida no continúa antes de que el jugador esté listo.
- `input.js` suelta las teclas y el puntero activos cuando la ventana pierde el foco (`blur`), porque el `keyup` no llega en segundo plano y la nave quedaría moviéndose sola al volver.

### 3.3 Efectos: sonido y vibración (v1.3)

Igual que la red, el audio y la vibración son un puerto: `game/` avisa de lo que ocurre y no sabe cómo se reproduce. `Game` recibe `effects` por el constructor (`new Game({ effects })`); por defecto usa `NoopEffects` (silencio), que es lo que corre en las pruebas y en Node. La implementación real vive en `src/effects.js` (código de enlace con el navegador, como `main.js` y `lifecycle.js`); `game/` nunca la importa.

| Miembro | Cuándo lo llama el juego | Sonido | Vibración |
|---|---|---|---|
| `shot()` | La nave local dispara. | Pitido corto agudo, volumen bajo (suena unas 3 veces por segundo). | — |
| `kill()` | Un impacto local destruye a un enemigo. | Tono medio descendente, breve. | — |
| `hit()` | La nave local pierde una vida. | Tono grave descendente, más largo y fuerte. | 150 ms |
| `gameOver()` | La partida termina (una sola vez). | Tres notas descendentes. | — |
| `unlock()` | Cada primer gesto del usuario (toque o tecla). | Crea o reanuda el `AudioContext`. | — |

- Los sonidos se sintetizan con osciladores de Web Audio: sin archivos de audio (coherente con §6; los sonidos definitivos son la tarea 4.8).
- Los WebViews bloquean el audio hasta que hay un gesto del usuario (§7): el `AudioContext` se crea o reanuda en `unlock()`. Los eventos anteriores al primer gesto no suenan.
- `createEffects({ AudioContextClass, haptics })` recibe el constructor de audio y el plugin de vibración inyectados (en `main.js`, `Haptics` de `@capacitor/haptics`). Si el entorno no tiene Web Audio o la vibración falla (p. ej. un navegador de escritorio), el efecto se omite en silencio: nunca debe interrumpir la partida.
- En pausa no hay eventos, así que no suena nada; en coop los eventos del compañero no generan efectos hasta que la Fase 3 lo decida.

### 3.4 Fondo decorativo (v1.4)

`Game` crea un `Starfield` (`src/game/Starfield.js`) y lo actualiza y dibuja como parte de su simulación. Es puramente cosmético: `update(dt)` no toca el DOM y `render(ctx)` recibe el contexto como parámetro (regla 2 de §3). Usa su propio generador de azar (`new Game({ starsRandom })`, por defecto `Math.random`) y **nunca** `Game.random`, para no alterar la secuencia determinista de la partida. No se sincroniza por red. El detalle visual está en `game_loop.md` §3.1.

### 3.5 Pantallas y navegación (v1.5 / v1.6)

Las pantallas de la app (splash, home, créditos, resultados, lobby, ranking y la propia pantalla de juego `playing`) son HTML + CSS dentro de `#ui`. Las une un router propio (`src/ui/screenRouter.js`): una sola pantalla activa, cada una es `mount…(container, params, nav) → unmount` y el `unmount` quita su DOM y sus listeners. El detalle está en `ui_screens.md`.

- **Invariante:** la simulación solo avanza mientras la pantalla activa es `playing`; en cualquier otra el juego está en pausa o terminado. Por eso desmontar `playing` llama a `game.pause()`.
- `Game` notifica el final de la partida con el callback `onGameOver(result)` (una sola vez, con `{ mode, score, wave, durationSeconds }`); `main.js` programa la pantalla de Resultados 1,2 s después.
- `input.js` solo está enganchado mientras dura `playing` y se quita mientras el menú de pausa está abierto (v1.6). Salir a mitad de partida es un **abandono**: no hay resultado ni ranking.
- `playing` ya no es una pantalla sin interfaz: lleva el botón de pausa (⏸) y su menú (`pauseController.js`). En coop no hay pausa: el botón es «Salir» con confirmación (tarea 3.16).

### 3.6 Orientación (v1.7)

El lienzo lógico es 9:16, así que la app empaquetada se bloquea en vertical. `src/orientation.js` exporta `lockPortrait(screenOrientation, { onError })`, que pide `portrait` al plugin `@capacitor/screen-orientation` (inyectado, como `lifecycle.js` con `@capacitor/app`). `main.js` lo llama al arrancar solo si `Capacitor.isNativePlatform()`; un rechazo del sistema se registra y no interrumpe el juego. Cuando exista la plataforma Android, `android:screenOrientation="portrait"` en la actividad principal evita además el giro durante el arranque (ver `docs/entrega.md`).

## 4. Modos de juego

- **Solo**: sin red. El puntaje se guarda en Firestore si hay sesión.
- **Coop (2 jugadores)**: sala por código. Un jugador es **host** (autoridad sobre vidas, puntaje, oleada y fin de partida).

## 5. Decisiones de diseño (ADR resumidas)

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| ADR-1 | Web (Canvas + JS + CSS) con Capacitor | Flutter / Unity / Kotlin nativo | Requisito: app híbrida con tecnologías web. |
| ADR-2 | Canvas 2D sin motor | Phaser | Menos dependencias; el alcance es pequeño. Phaser sigue siendo una migración posible. |
| ADR-3 | RTDB para la partida | Firestore | Firestore cobra por lectura/escritura; a 10-15 Hz agota la cuota diaria. |
| ADR-4 | Host autoritativo | Servidor dedicado / Cloud Functions | Sin costo ni backend propio. |
| ADR-5 | Formación enemiga determinista (semilla + hora del servidor) | Sincronizar cada enemigo | Reduce tráfico a casi cero. |
| ADR-6 | Coordenadas normalizadas (x ∈ [0,1]) en red | Píxeles | Independencia de resolución entre dispositivos. |
| ADR-7 | Lienzo lógico fijo 360×640 escalado por CSS | Resolución dependiente del dispositivo | Misma simulación en todos los dispositivos; evita desfases entre jugadores. |
| ADR-8 | Bucle con `requestAnimationFrame` y `dt` limitado a 50 ms | Paso fijo | Más simple; suficiente para el MVP. |
| ADR-9 | Pausa automática en segundo plano con reanudación manual (toque) | Reanudar solo al volver a primer plano | El jugador puede volver sin estar listo y perder una vida al instante. |
| ADR-10 | Sonidos sintetizados con Web Audio + `@capacitor/haptics` para vibrar | Archivos de audio / `navigator.vibrate` | Cero assets en el MVP; `navigator.vibrate` no cubre iOS ni garantiza el permiso en Android. |
| ADR-11 | Router de pantallas propio (`screenRouter.js`, ~100 líneas) | Librería de rutas / SPA framework | Cinco pantallas; el router se prueba en Node con contenedor y pantallas falsas y no añade dependencias. |
| ADR-12 | Resultados aparece 1,2 s después del Game Over y el reinicio es solo por botón | Reinicio con un toque en el canvas | Un toque accidental al morir no debe saltarse el puntaje. |

## 6. Requisitos no funcionales

- 60 FPS en un gama media de 2020 dentro del WebView.
- Latencia percibida del compañero < 200 ms (con interpolación).
- Tráfico por jugador < 5 KB/s en partida.
- Sin assets externos en el MVP (formas dibujadas con Canvas); sprites y audio opcionales en Fase 4.
- Bloqueo de orientación vertical en la app empaquetada (§3.6).

## 7. Particularidades del entorno híbrido

- `vite.config.js` usa `base: './'` para que los recursos se resuelvan con rutas relativas dentro del WebView.
- Tras cada cambio web: `npm run build` y `npx cap sync` antes de abrir Android Studio / Xcode.
- Eventos táctiles: usar **Pointer Events** y `touch-action: none` en el canvas para evitar scroll y zoom.
- Audio en WebView móvil requiere un gesto del usuario antes de reproducir (relevante en Fase 4).
- iOS requiere macOS y Xcode; Android requiere Android Studio. Para la entrega universitaria basta con Android (APK).

## 8. Criterios de aceptación globales

- `npm test` pasa y `npm run build` termina sin errores.
- Modo solo jugable de principio a fin sin Firebase configurado, en navegador y en la app Android.
- Dos dispositivos reales completan una partida cooperativa de 5 minutos sin desincronización visible.