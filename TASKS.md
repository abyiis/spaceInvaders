# TASKS.md — Backlog del MVP (Canvas + JS + CSS + Capacitor + Firebase)

Leyenda de etiquetas:
- Prioridad: `P0` imprescindible · `P1` importante · `P2` deseable
- Dificultad: `D1` trivial · `D2` fácil · `D3` media · `D4` difícil · `D5` muy difícil
- Specs relacionadas entre corchetes: `[arch]` architecture · `[loop]` game_loop · `[sync]` multiplayer_sync · `[fb]` firebase_schema · `[ui]` ui_screens

> **Regla SDD:** si una tarea exige cambiar el comportamiento descrito en `.spec/`, se actualiza primero el spec (y se anota en el changelog al final de este archivo) y luego el código.

Estimación total orientativa: 7-8 semanas a media jornada (incluye la Fase 2B).

---

## Fase 0 — Setup & Specs (≈ 3 días)

- [x] 0.1 `P0 D1` Estructura de proyecto y specs v1.0 en `.spec/` `[arch]`
- [x] 0.2 `P0 D2` Boilerplate Canvas + JS + CSS jugable (nave, enemigos, disparos) con pruebas `node --test`
- [x] 0.3 `P0 D1` Instalar Node ≥ 20, ejecutar `npm install` y `npm run dev`; verificar el juego en el navegador (móvil o modo responsive de DevTools)
- [x] 0.4 `P0 D1` Ejecutar `npm run build` y confirmar que se genera `dist/`
- [ ] 0.5 `P0 D1` Inicializar repositorio Git y primer commit
- [ ] 0.6 `P0 D2` Cambiar `appId` en `capacitor.config.json` (p. ej. `co.edu.tuuniversidad.spacecoop`) y ejecutar `npx cap add android` `[arch]`
- [ ] 0.7 `P0 D2` Ejecutar `npm run android` y probar el juego en un emulador o teléfono real `[arch]`
- [ ] 0.8 `P0 D2` Crear proyecto Firebase (plan Spark), registrar una app **Web** y guardar su configuración en `src/net/firebaseConfig.js` (ignorado por Git) `[fb]`
- [ ] 0.9 `P0 D2` Habilitar Authentication → Anónimo; crear RTDB (región `us-central1`) y Firestore (modo producción) `[fb]`
- [ ] 0.10 `P1 D1` Desplegar reglas: `firebase deploy --only database,firestore` `[fb]`

## Fase 1 — Motor del juego, un jugador (≈ 2 semanas)

- [x] 1.1 `P0 D2` `Player` con movimiento horizontal por arrastre (Pointer Events) y teclado, y disparo automático `[loop]`
- [x] 1.2 `P0 D2` `Bullet` (jugador y enemiga) con eliminación fuera de pantalla `[loop]`
- [x] 1.3 `P0 D3` `Formation` con movimiento lateral, escalón vertical y disparo enemigo `[loop]`
- [x] 1.4 `P0 D2` Colisiones AABB bala↔enemigo y bala↔jugador `[loop]`
- [x] 1.5 `P0 D2` Puntaje, vidas, HUD y pantalla de game over con reinicio `[loop]` *(el game over pasa a ser la pantalla de Resultados HTML: 2B.7 y 2B.8)*
- [x] 1.6 `P0 D2` Oleadas infinitas con dificultad creciente `[loop]`
- [x] 1.7 `P1 D2` `waveParams(w)` como función pura en `src/core/difficulty.js` con pruebas `[loop]`
- [x] 1.8 `P1 D2` Enemigos de 2 puntos de vida desde la oleada 5 (filas pares) con pruebas `[loop]`
- [x] 1.9 `P1 D3` Invulnerabilidad tras daño (1,5 s) con parpadeo y pruebas `[loop]`
- [x] 1.10 `P1 D2` Definir la interfaz `SyncGateway` y `NoopSyncGateway`; inyectarla en `Game` `[arch]`
- [x] 1.11 `P1 D2` Pausar el juego cuando la app pasa a segundo plano (`visibilitychange` y evento `appStateChange` de Capacitor) `[arch]`
- [x] 1.12 `P2 D2` Sonidos básicos (WebAudio) y vibración al recibir daño `[arch]`
- [x] 1.13 `P2 D3` Fondo con estrellas en parallax

## Fase 2 — Integración Firebase & Lobby (≈ 1,5 semanas)

- [x] 2.1 `P0 D2` `src/net/firebase.js`: inicializar la app con el SDK modular y exportar `auth`, `rtdb`, `db`; fallar con un mensaje claro si falta `firebaseConfig.js` `[arch]`
- [x] 2.2 `P0 D2` `authService.js`: inicio de sesión anónimo y exposición de `uid` `[fb]`
- [x] 2.3 `P0 D3` Menú principal en HTML/CSS dentro de `#ui` (Jugar solo, Crear sala, Unirse a sala, Ranking) `[arch]` *(pasa a ser el Home con router: 2B.2 y 2B.4)*
- [x] 2.4 `P0 D3` `roomRepository.createRoom()`: genera código de 5 caracteres, semilla y nodo `meta` `[sync][fb]`
- [x] 2.5 `P0 D3` `roomRepository.joinRoom(code)` con validación (sala existe, no llena, estado `lobby`) `[sync]`
- [x] 2.6 `P0 D3` Pantalla de lobby con lista de jugadores en vivo y botón "Listo" `[sync]`
- [x] 2.7 `P0 D3` Presencia: `onDisconnect()` y estado `connected` `[sync]`
- [x] 2.8 `P1 D2` Guardar puntaje en Firestore al terminar partida solo `[fb]` *(su estado se muestra en la pantalla de Resultados: 2B.9)*
- [x] 2.9 `P1 D2` Pantalla de ranking (top 20) `[fb]`
- [x] 2.10 `P1 D2` Alias de jugador (persistido en `users/{uid}`) `[fb]`
- [x] 2.11 `P1 D2` Reglas de seguridad de RTDB y Firestore probadas con el emulador o la consola `[fb]`

## Fase 2B — Pantallas de la app y navegación (≈ 1 semana)

Spec: `.spec/ui_screens.md`. Pueden hacerse en paralelo a las Fases 2 y 3 porque no dependen del coop. Dependencias: 2B.2 necesita 2B.1; 2B.3, 2B.4, 2B.6 y 2B.12 necesitan 2B.2; 2B.8 necesita 2B.2 y 2B.7; 2B.9 necesita 2B.8 y 2.8; 2B.10 necesita 2B.8; 2B.11 necesita 2B.2 y 2B.12 (el caso «jugando»); 2B.13 va al final.

- [x] 2B.0 `P0 D2` Specs de pantallas: nuevo `.spec/ui_screens.md` v1.1 y actualización de `architecture.md` (v1.6) y `game_loop.md` (v1.4) `[ui][arch][loop]`
- [x] 2B.1 `P0 D3` Router de pantallas `src/ui/screenRouter.js` y `src/ui/uiConstants.js`, con pruebas usando contenedor y pantallas falsas `[ui]`
- [x] 2B.2 `P0 D3` Refactor de `main.js` y `mainMenu.js` para usar el router: el juego arranca en pausa, `attachInput` solo se engancha al montar `playing` y se quita al desmontarla, y «Jugar solo» monta `playing` llamando a `startNewGame()` `[ui][arch]`
- [x] 2B.3 `P1 D2` Splash `src/ui/screens/splash.js`: nave en SVG, título y lema, 2,5 s, omitible desde 0,8 s, fundido de 200 ms y `prefers-reduced-motion`; tokens CSS comunes en `style.css`; pruebas de la lógica de tiempo con temporizadores inyectados `[ui]`
- [x] 2B.4 `P1 D2` Home: añadir el botón «Créditos» y conectar los botones al router; mantener los avisos de «disponible pronto» de Crear sala, Unirse a sala y Ranking `[ui]`
- [x] 2B.5 `P1 D1` *(equipo)* Datos de los créditos: solo los nombres de los integrantes (Juan Felipe Cano Noreña, Juan David Parra Sierra, Santiago Viana Ayala) `[ui]`
- [x] 2B.6 `P1 D2` Pantalla de Créditos `src/ui/screens/credits.js` y `src/ui/creditsData.js` con los tres nombres de 2B.5 (sin roles), scroll con botón «Volver» fijo y prueba de la forma de los datos `[ui]`
- [x] 2B.7 `P0 D3` `Game` llama a `onGameOver(result)` una sola vez con `{ mode, score, wave, durationSeconds }`; se elimina el texto «GAME OVER» del canvas y `input.js` deja de reiniciar con el toque o con Espacio/Enter; pruebas `[loop][arch]`
- [x] 2B.8 `P0 D3` Pantalla de Resultados `src/ui/screens/results.js`: puntaje, oleada y tiempo (`formatScore` y `formatDuration` puras, con pruebas), aparece 1,2 s después del Game Over, foco en «Jugar de nuevo» y botón «Inicio» `[ui][loop]`
- [x] 2B.9 `P1 D2` Estado de guardado en Resultados (guardando, guardado, error con «Reintentar»), oculto si no hay Firebase; recibe `saveScore` inyectado desde `main.js` `[ui][fb]`
- [x] 2B.10 `P1 D2` Récord personal local (`src/ui/bestScore.js`, `localStorage` inyectable, con pruebas): insignia «¡Nuevo récord!» en Resultados y línea «Tu récord» en Home `[ui]`
- [x] 2B.11 `P1 D2` Botón «Atrás» de Android con `@capacitor/app`: Créditos y Resultados vuelven a Home, Home cierra la app, jugando abre el menú de pausa; pruebas del mapa de destinos con el plugin inyectado `[ui][arch]`
- [x] 2B.12 `P1 D3` Botón de pausa (⏸, Esc o P) y menú de pausa con «Continuar» y «Salir al inicio» (`src/ui/pauseController.js`): el input se quita mientras el menú está abierto, abandonar no genera resultado ni guarda puntaje, y desmontar `playing` pausa el juego; pruebas `[ui][loop]`
- [ ] 2B.13 `P1 D2` Revisión manual del flujo completo en el navegador (360×640 y 320×568) y en Android, incluida la salida al Home desde la pausa; capturas para el informe `[ui]`
  - Parcial: Home/Créditos revisados a 360×640 y 320×568; pausa, continuar y salida al inicio a 320×568; Game Over → Resultados tras perder vidas a 360×640. Falta repetir Resultados a 320×568 y validar Android; no hay carpeta `android/`, `adb` ni Android SDK disponibles, así que la tarea permanece pendiente.

## Fase 3 — Cooperativo en sincronía (≈ 2 semanas)

- [x] 3.1 `P0 D3` PRNG determinista propio (`src/core/prng.js`, mulberry32) con pruebas `[sync]`
- [x] 3.2 `P0 D4` Reloj compartido: `.info/serverTimeOffset` y cuenta atrás hasta `startAt` `[sync]`
- [x] 3.3 `P0 D5` Refactor de `Formation` a movimiento determinista `f(seed, wave, t)` con pruebas de igualdad entre dos instancias `[sync][loop]`
- [x] 3.4 `P0 D3` Disparos enemigos deterministas desde la semilla `[sync]`
- [x] 3.5 `P0 D3` `syncService.js`: publicar posición propia a 10 Hz solo si cambió `[sync]` *(implementado en `CoopGateway` con el publicador puro `src/core/positionPublisher.js`; ver ADR-13)*
- [x] 3.6 `P0 D4` Nave del compañero con buffer de interpolación (100 ms) `[sync]`
- [x] 3.7 `P0 D3` Eventos `shot` (cosméticos) para mostrar los disparos del compañero `[sync]`
- [x] 3.8 `P0 D4` Eventos `kill`: reclamo por el jugador, adjudicación por el host (primero gana) con pruebas de la lógica pura `[sync]`
- [x] 3.9 `P0 D4` Eventos `hit` y vidas por jugador escritas por el host `[sync]`
- [x] 3.10 `P0 D3` Fin de oleada y de partida decididos por el host (`state`) `[sync][loop]`
- [x] 3.11 `P1 D4` Reasignación del rol de host si el host se desconecta `[sync]`
- [x] 3.12 `P1 D3` Avisos de "conexión inestable" y compañero desconectado `[sync]`
- [x] 3.13 `P1 D2` Resultados de partida coop (reutiliza la pantalla de Resultados de 2B.8 con desglose por jugador y «Volver al lobby») y guardado en ranking (solo host) `[fb][ui]`
- [x] 3.14 `P1 D2` Limpieza de la sala al finalizar `[sync]`
- [ ] 3.15 `P1 D3` Prueba manual documentada con 2 dispositivos reales y redes distintas `[sync]`
  - Parcial: guía y tabla de resultados en `docs/pruebas-coop.md`; la lógica está cubierta con una prueba de integración de dos clientes. Falta ejecutarla con dos teléfonos reales (no hay dispositivos ni Android SDK en el entorno de desarrollo).
- [x] 3.16 `P1 D2` Salir de una partida coop a mitad de partida: botón «Salir» con confirmación «¿Salir de la partida?», abandono de la sala y limpieza `[sync][ui]`

## Fase 4 — Pulido & Entrega universitaria (≈ 1 semana)

- [x] 4.1 `P0 D2` Bloquear orientación vertical en la app (plugin `@capacitor/screen-orientation` o configuración de Android) `[arch]`
  - Implementado con el plugin (`src/orientation.js`) y probado con el plugin inyectado; confirmar el bloqueo en un teléfono o emulador junto con 2B.13 y 4.2.
- [ ] 4.2 `P0 D2` Probar rendimiento en un teléfono real dentro del WebView (60 FPS en solo, sin tirones en coop)
  - Parcial: panel de FPS (`?debug=1` o 5 toques en Créditos), `npm run bench` y procedimiento en `docs/pruebas-rendimiento.md`. Falta medir en un teléfono real (no hay dispositivo en el entorno de desarrollo).
- [ ] 4.3 `P0 D2` Medir tráfico real en la consola de Firebase y comparar con el presupuesto de `multiplayer_sync.md` §7
- [ ] 4.4 `P0 D2` Ícono y pantalla de arranque **nativa** (splash de Capacitor, de 1 s o menos); no es el splash de la app, que es la tarea 2B.3 `[ui]`
- [ ] 4.5 `P0 D2` Generar APK de entrega desde Android Studio (Build → Build Bundle(s) / APK(s))
- [ ] 4.6 `P0 D2` Redactar el informe: arquitectura, decisiones (ADR), limitaciones y pruebas
- [ ] 4.7 `P1 D2` Preparar la demostración: guion de 5 minutos con 2 teléfonos
- [ ] 4.8 `P1 D2` Sprites y sonido definitivos (opcional)
- [ ] 4.9 `P2 D3` Power-ups simples (disparo doble) *(solo si sobra tiempo)*
- [ ] 4.10 `P2 D2` Revisar y actualizar `.spec/` para reflejar lo realmente implementado

---

## Fuera de alcance (no hacer en el MVP)

Matchmaking aleatorio, chat, compras, anti-trampas, más de 4 jugadores, reconexión a mitad de partida tras cierre de la app, publicación en tiendas.

## Changelog de specs

| Fecha | Spec | Cambio | Motivo |
|---|---|---|---|
| 2026-10-17 | todos | v1.0 inicial (stack híbrido: Canvas + JS + CSS + Capacitor) | Creación del proyecto |
| 2026-10-18 | architecture | v1.1: §3.1 puerto `SyncGateway` (salida: posición, `shot`, `kill`, `hit`, `dispose`); archivo `src/game/SyncGateway.js` | Tarea 1.10 |
| 2026-10-18 | architecture | v1.2: §3.2 pausa y ciclo de vida (`src/lifecycle.js`, reanudación manual, sin pausa en coop); nueva dependencia `@capacitor/app`; ADR-9 | Tarea 1.11 |
| 2026-10-18 | game_loop | v1.1: estado `PAUSED` (§7) y condición `paused` en el ciclo por frame (§3) | Tarea 1.11 |
| 2026-10-18 | architecture | v1.3: §3.3 puerto `Effects` (`shot`, `kill`, `hit`, `gameOver`, `unlock`), `src/effects.js` con Web Audio y vibración; nueva dependencia `@capacitor/haptics`; ADR-10 | Tarea 1.12 |
| 2026-10-18 | game_loop | v1.2: §3.1 fondo de estrellas en parallax (3 capas, entidad `Starfield`, paso 2 del ciclo por frame) | Tarea 1.13 |
| 2026-10-18 | architecture | v1.4: §3.4 `Starfield` decorativo con generador de azar propio (`starsRandom`); `Starfield.js` en el árbol | Tarea 1.13 |
| 2026-10-22 | ui_screens | v1.0 nuevo: pantallas Splash, Home, Créditos y Resultados; router de pantallas (`screenRouter`), tiempos (`uiConstants`), modelo `GameResult`, récord local y botón «Atrás» opcionales | Decisión del equipo; tareas 2B.0 – 2B.13 |
| 2026-10-22 | architecture | v1.5: §3.5 pantallas y navegación; regla 6 (`game/` no importa `ui/`); árbol de `ui/` ampliado; ADR-11 (router propio) y ADR-12 (Resultados con retraso y reinicio por botón) | Tarea 2B.0 |
| 2026-10-22 | game_loop | v1.3: §7 estados con pantallas de la app; §7.1 `onGameOver(result)`; el Game Over ya no se cierra con un toque ni se dibuja en el canvas | Tarea 2B.0 |
| 2026-10-22 | ui_screens | v1.1: créditos solo con nombres (sin roles, curso ni institución); récord local y botón «Atrás» dejan de ser opcionales; nuevo §9 menú de pausa y salida al Home (botón ⏸, `pauseController`); secciones 9-14 pasan a 10-15 | Supuestos confirmados por el equipo |
| 2026-10-22 | architecture | v1.6: `pauseController.js` en el árbol de `ui/`; `playing` ya no es una pantalla sin interfaz (lleva el botón de pausa); input fuera mientras el menú de pausa está abierto; salir a mitad de partida es un abandono | Supuestos confirmados por el equipo |
| 2026-10-22 | game_loop | v1.4: `PAUSED → HOME` por «Salir al inicio» (partida abandonada, sin `onGameOver`); `PAUSED` se alcanza también con el botón ⏸ | Supuestos confirmados por el equipo |
| 2026-10-26 | ui_screens | v1.2: §9 y §12 salida de una partida coop (botón ✕, diálogo «¿Salir de la partida?», «Atrás» de Android) | Tarea 3.16 |
| 2026-10-26 | ui_screens | v1.2: §8.1 y §8.6 Resultados en coop (desglose por jugador, guardado solo del host, «Volver al lobby» y salida de la sala) | Tarea 3.13 |
| 2026-10-26 | architecture | v1.7: §3.6 bloqueo de orientación vertical (`orientation.js`); nueva dependencia `@capacitor/screen-orientation` | Tarea 4.1 |
| 2026-10-26 | game_loop | v1.5: en coop el host decide las transiciones de fase y el fin de partida (§3) | Tarea 3.10 |
| 2026-10-26 | firebase_schema | v1.1: tipos de evento `enemy-shot`, `bonus-kill`, `revive`, `life-loss`, `state`, `phase`, `game-over`; los del host solo los firma `hostUid`; nodo `state/` reservado sin uso | Tarea 3.9 |
| 2026-10-26 | game_loop | v1.5: §4.1 movimiento de la formación como función pura del tiempo de oleada, con los límites de la rejilla completa | Tarea 3.3 |
| 2026-10-25 | multiplayer_sync | v1.1: modelo coop realmente implementado (reloj bloqueado al servidor con cuenta atrás, PRNG por flujo, formación y disparos deterministas, host autoritativo mediante eventos `phase`/`state`/`game-over`, relevo de host, avisos de conexión); ADR-13 | Tareas 3.1 – 3.16 |
