# Informe técnico — Neon Invaders (Space Coop)

Proyecto universitario de la asignatura de Aplicaciones Móviles (UPB, 7.º semestre). Juego móvil estilo Space Invaders, arcade infinito por puntuación, con modo cooperativo en tiempo real para dos jugadores. Desarrollado con **Spec-Driven Development (SDD)**: las especificaciones de `.spec/` son la fuente de verdad y el código las cumple.

Equipo: Juan Felipe Cano Noreña, Juan David Parra Sierra, Santiago Viana Ayala.

## 1. Resumen

| | |
|---|---|
| Tipo de app | Híbrida: web (HTML5 Canvas + JavaScript + CSS) empaquetada con **Capacitor** como app Android/iOS |
| Modos | Solo (sin red) y cooperativo online de 2 jugadores por código de sala |
| Backend | Firebase en plan gratuito Spark: Realtime Database (partida), Cloud Firestore (ranking y perfiles), Auth anónima. Sin Cloud Functions |
| Pruebas | 332 pruebas automáticas con `node --test` + 9 pruebas de reglas de seguridad con el emulador de Firebase |
| Estado | Solo y coop completos a nivel de código y pruebas automáticas; **pendiente**: validación con dos teléfonos reales, medición de rendimiento y tráfico reales y generación del APK (ver §9) |

## 2. Funcionalidades

- **Juego:** nave que se mueve por arrastre o teclado y dispara sola; oleadas infinitas con dificultad creciente (`waveParams`), enemigos de 2 puntos de vida desde la oleada 5, kamikazes y naves de soporte con escudo, **jefes** cada 3 oleadas (dos fases, tres diseños, nave de apoyo que lo cura), **fases bonus** cada 5 oleadas con combos hasta ×5, **peligros ambientales** (lluvia de asteroides, campo magnético, oscuridad), **cuatro potenciadores** (escudo, disparo rápido, triple disparo, sobrecarga), sonidos sintetizados y vibración.
- **Cooperativo:** crear/unirse a sala por código de 5 caracteres, lobby en vivo con «Listo», cuenta atrás compartida, naves de ambos jugadores, **sinergia de disparos** (dos disparos de jugadores distintos que se cruzan explotan), **rescate** de la nave caída gastando una vida compartida, puntaje de equipo, resultados con desglose por jugador, guardado en el ranking por el host, relevo de host si se cae y avisos de conexión.
- **Aplicación:** splash, Home, Créditos, Resultados, ranking top 20, alias persistente, récord personal local, pausa y botón «Atrás» de Android, panel de depuración de FPS y tráfico.

## 3. Arquitectura

```
index.html ── <canvas id="game"> + <div id="ui">
src/
├── main.js, lifecycle.js, orientation.js, effects.js     enlace con navegador/Capacitor
├── core/    lógica pura (sin DOM ni Firebase): constants, difficulty, collision,
│            prng, gameClock, formationPath, shotSchedule, hostLedger, hostElection,
│            positionPublisher, interpolationBuffer, connectionMonitor,
│            trafficMeter, frameStats
├── game/    simulación: Game, Player, Enemy, Formation, Boss, BonusStage, Hazards,
│            Starfield, powerUps, input + puertos SyncGateway/CoopGateway/Effects
├── net/     acceso a Firebase tras interfaces: roomRepository, scoreRepository,
│            profileRepository, authService
└── ui/      pantallas HTML/CSS y router propio
```

Reglas de dependencia (verificadas por revisión y por la estructura de imports): `core/` no importa nada del proyecto; `game/` no usa el DOM en `update()` ni importa `firebase/*` ni `ui/`; el acceso a Firebase vive en `net/`; el modo solo funciona sin Firebase configurado. Gracias a ello **toda la simulación, incluida la del cooperativo, se prueba en Node** (una prueba de integración conecta dos `Game` reales mediante una sala RTDB en memoria con latencia y reloj virtual).

### Puertos y adaptadores

| Puerto | Adaptadores | Por qué |
|---|---|---|
| `SyncGateway` (`game/`) | `NoopSyncGateway` (solo), `CoopGateway` (coop) | `Game` notifica eventos locales y recibe los del compañero sin saber si hay red |
| `Effects` | `NoopEffects`, `effects.js` (Web Audio + `@capacitor/haptics`) | Sonido y vibración fuera de la simulación |
| Repositorios de `net/` | Firebase real; dobles de prueba | Pruebas sin red; reglas verificadas con el emulador |

## 4. Modelo de sincronización cooperativa (resumen de `multiplayer_sync.md` v1.1)

1. **Reloj compartido.** Cada cliente conoce `serverNow = Date.now() + serverTimeOffset`. El host fija `meta/startAt = serverNow + 3 s`; todos muestran 3‑2‑1 y la simulación avanza en pasos fijos de 1/60 s hasta alcanzar `t = (serverNow − startAt)/1000`. El `dt` del `requestAnimationFrame` se ignora en coop, así que una caída de FPS no desfasa la partida.
2. **Determinismo.** La semilla de la sala alimenta el PRNG propio (`mulberry32`); cada flujo (disparos de la oleada *w*, naves bonus, peligros) deriva su secuencia con `deriveSeed(semilla, sal)` para que lo que consume un cliente no altere a otro. La formación enemiga es una función pura de `(oleada, t)` con los límites de la rejilla completa, y los disparos de la formación salen de un calendario determinista: **no viajan por la red**.
3. **Qué se sincroniza.** Posición de la nave (10 Hz, solo si cambia más de 0,002, con latido cada 2 s) interpolada 100 ms atrás en el receptor, y eventos discretos (`shot`, `kill`, `bonus-kill`, `hit`, `revive`, `life-loss`, `enemy-shot` del jefe).
4. **Host autoritativo.** Solo el host decide el fin de cada oleada, el jefe, la fase bonus y el fin de partida, y los anuncia con `phase`, `state` y `game-over` (puntaje y vidas oficiales). El libro de bajas del host aplica «el primero en llegar gana» a los reclamos duplicados. Si el host se desconecta, el invitado de menor `uid` lo releva a los 2 s (las reglas solo lo permiten si el host figura desconectado).
5. **Conexión.** `ConnectionMonitor` combina `.info/connected`, la presencia del compañero y los latidos: «Conexión inestable» (> 5 s sin señal), «Compañero desconectado» (cuenta atrás de 10 s) y baja del compañero.
6. **Ciclo de vida de la sala.** `lobby → playing → finished`; el host guarda el puntaje en Firestore y borra la sala al salir de Resultados; salir del lobby libera la plaza o cierra la sala.

### Seguridad (reglas verificadas con el emulador)

- RTDB: lectura solo autenticada y nunca el listado de salas; cada jugador escribe únicamente su nodo; los eventos solo se crean con el `uid` propio y no se editan; los eventos de autoridad (`state`, `phase`, `game-over`, `enemy-shot`) solo los firma `meta/hostUid`; el relevo de host y el borrado de salas están acotados (host o jugador con el host desconectado).
- Firestore: perfil privado; ranking legible por autenticados, solo creación con `uid == auth.uid`, puntaje entero ≤ 1 000 000 y, en coop, lista de jugadores que incluye a quien guarda.
- Limitación aceptada: sin Cloud Functions un cliente malicioso puede falsear `kill`; no hay anti-trampas.

## 5. Decisiones de diseño (ADR)

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| 1 | Web (Canvas + JS + CSS) con Capacitor | Flutter, Unity, Kotlin nativo | Requisito de app híbrida con tecnologías web |
| 2 | Canvas 2D sin motor | Phaser | Alcance pequeño, menos dependencias, lógica probable en Node |
| 3 | RTDB para la partida | Firestore | Firestore cobra por operación; a 10 Hz agotaría la cuota |
| 4 | Host autoritativo | Servidor propio / Cloud Functions | Sin coste ni backend |
| 5 | Simulación determinista a partir de semilla y hora del servidor | Sincronizar cada enemigo | Tráfico casi nulo |
| 6 | Coordenadas normalizadas en red | Píxeles | Independencia de resolución |
| 7 | Lienzo lógico fijo 360×640 | Resolución del dispositivo | Misma simulación en todos los teléfonos |
| 8 | `requestAnimationFrame` con `dt` ≤ 50 ms (solo) | Paso fijo | Simplicidad; en coop se usa paso fijo atado al servidor |
| 9 | Pausa automática en segundo plano con reanudación manual | Reanudar sola | Evita perder una vida sin estar listo |
| 10 | Sonidos sintetizados + `@capacitor/haptics` | Archivos de audio / `navigator.vibrate` | Cero assets; iOS y permisos |
| 11 | Router de pantallas propio | Librería de rutas | Cinco pantallas, probable en Node |
| 12 | Resultados 1,2 s después del Game Over, reinicio solo por botón | Reinicio con un toque | Un toque accidental no debe saltarse el puntaje |
| 13 | **Estado autoritativo en eventos del host, no en un nodo `state`** | Nodo `state` + eventos | Orden total por push ID: un `phase` nunca llega antes que los `kill` que lo causan; una sola suscripción |
| 14 | **Mantener la simulación local con reloj bloqueado al servidor** (jefes, kamikazes y peligros incluidos) | Reescribir todo como función pura de `(semilla, oleada, t)` | La formación y sus disparos sí son puros; lo demás depende de la posición de los jugadores. Se sincronizan las decisiones del host |
| 15 | Paso fijo de 1/60 s atado a `serverNow` en coop | Integrar con el `dt` de cada cliente | Una caída de FPS o un segundo plano no acumula deriva |
| 16 | «Volver al lobby» deja la sala y vuelve al Home | Reutilizar la sala para otra partida | Reiniciar una sala exigiría que el host reescriba nodos de otros jugadores (las reglas lo impiden) |
| 17 | Splash e ícono generados por código (`npm run assets`) | Imágenes dibujadas a mano | Reproducible, sin dependencias, coherente con la nave del juego |

## 6. Pruebas

| Tipo | Qué cubre |
|---|---|
| Unitarias de lógica pura | PRNG, reloj, formación, calendario de disparos, libro de bajas, elección de host, publicador de posición, interpolación, monitor de conexión, medidores |
| Unitarias de simulación | Game, jefes, bonus, peligros, potenciadores, colisiones, kills y fases coop, vidas, resultados |
| Integración en Node | Dos `Game` + `CoopGateway` sobre una sala RTDB en memoria: cuenta atrás, formación y disparos idénticos, 7 oleadas con jefe y bonus en sincronía, fin de partida, caída del host, compañero desconectado, límite de tráfico |
| UI y red | Router, pantallas (Resultados, Splash, Créditos), pausa y salida coop, «Atrás», repositorios con dobles |
| Reglas de seguridad | Emulador de RTDB y Firestore (`npm run test:rules`): permisos, eventos del host, relevo, borrado de salas, ranking coop (9 casos) |

`npm test` ejecuta todo salvo las reglas (necesitan Java y Firebase CLI). Resultado al cierre: 332 pasan, 0 fallan; `npm run build` termina sin errores.

**Pruebas manuales pendientes:** `docs/pruebas-coop.md` (dos teléfonos, redes distintas, 14 escenarios), `docs/pruebas-rendimiento.md` (FPS y tráfico reales) y la revisión de pantallas en Android (tarea 2B.13).

## 7. Mediciones

- **CPU de la lógica** (`npm run bench`, 10 min simulados): `update` 0,007 ms de media y 0,06 ms en p99 por frame frente a un presupuesto de 16,7 ms; el coste real está en el dibujo (~150 llamadas por frame), que solo se mide en el teléfono.
- **Tráfico del coop** (simulador de dos clientes, 10 min, piloto automático sin parar): ~1,0 MB enviados y ~0,9 MB recibidos por cliente (1,7 KB/s ↑, 1,5 KB/s ↓), ~1,9 MB de descarga en total; límite del requisito: 5 KB/s por jugador. Cifra real pendiente de la consola de Firebase.

## 8. Limitaciones conocidas

- Sin anti-trampas: un cliente modificado puede falsear reclamos de baja.
- Sin reconexión a mitad de partida tras cerrar la app; un compañero ausente más de 10 s se da por fuera.
- Las pequeñas diferencias visuales (≈ 100 ms) entre pantallas son inherentes al diseño; el kamikaze en picado y los asteroides se simulan por separado en cada cliente.
- Dos jugadores como máximo en el MVP (las reglas admiten hasta 4, la lógica de relevo y de resultados ya es general).
- Plan Spark: 100 conexiones simultáneas.
- La app Capacitor no se ha verificado todavía en un emulador o dispositivo.
- Si el equipo cambia el despliegue de Firebase, las reglas de `firebase/` son obligatorias: sin ellas el coop falla con «permission_denied».

## 9. Estado de las tareas y trabajo pendiente

Ver `TASKS.md`. Quedan abiertas las que exigen hardware o herramientas ausentes en el entorno de desarrollo: 0.6/0.7 (plataforma Android), 2B.13, 3.15, 4.2, 4.3, 4.4 (generar con Android) y 4.5 (APK). Cada una tiene una guía en `docs/`.

## 10. Proceso

SDD: cada tarea actualizó primero el spec correspondiente (changelog al final de `TASKS.md`), después el código y las pruebas, y se registró en un commit propio. Durante la revisión final se detectó y corrigió que `.spec/architecture.md` había sido sobrescrito por error con el contenido de `ui_screens.md` en el commit `d5ec5fe`; se restauró desde el historial y se reaplicaron los cambios posteriores.

## 11. Cómo ejecutar

```bash
npm install
npm test            # pruebas unitarias e integración
npm run test:rules  # reglas con emuladores (Java + Firebase CLI)
npm run dev         # desarrollo (añade ?debug=1 para ver FPS y tráfico)
npm run build       # genera dist/
npm run bench       # coste de la simulación
npm run assets      # regenera ícono y splash
```
