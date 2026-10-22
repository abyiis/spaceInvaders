# TASKS.md — Backlog del MVP (Canvas + JS + CSS + Capacitor + Firebase)

Leyenda de etiquetas:
- Prioridad: `P0` imprescindible · `P1` importante · `P2` deseable
- Dificultad: `D1` trivial · `D2` fácil · `D3` media · `D4` difícil · `D5` muy difícil
- Specs relacionadas entre corchetes: `[arch]` architecture · `[loop]` game_loop · `[sync]` multiplayer_sync · `[fb]` firebase_schema

> **Regla SDD:** si una tarea exige cambiar el comportamiento descrito en `.spec/`, se actualiza primero el spec (y se anota en el changelog al final de este archivo) y luego el código.

Estimación total orientativa: 6-7 semanas a media jornada.

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
- [x] 1.5 `P0 D2` Puntaje, vidas, HUD y pantalla de game over con reinicio `[loop]`
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
- [ ] 2.2 `P0 D2` `authService.js`: inicio de sesión anónimo y exposición de `uid` `[fb]`
- [ ] 2.3 `P0 D3` Menú principal en HTML/CSS dentro de `#ui` (Jugar solo, Crear sala, Unirse a sala, Ranking) `[arch]`
- [ ] 2.4 `P0 D3` `roomRepository.createRoom()`: genera código de 5 caracteres, semilla y nodo `meta` `[sync][fb]`
- [ ] 2.5 `P0 D3` `roomRepository.joinRoom(code)` con validación (sala existe, no llena, estado `lobby`) `[sync]`
- [ ] 2.6 `P0 D3` Pantalla de lobby con lista de jugadores en vivo y botón "Listo" `[sync]`
- [ ] 2.7 `P0 D3` Presencia: `onDisconnect()` y estado `connected` `[sync]`
- [ ] 2.8 `P1 D2` Guardar puntaje en Firestore al terminar partida solo `[fb]`
- [ ] 2.9 `P1 D2` Pantalla de ranking (top 20) `[fb]`
- [ ] 2.10 `P1 D2` Alias de jugador (persistido en `users/{uid}`) `[fb]`
- [ ] 2.11 `P1 D2` Reglas de seguridad de RTDB y Firestore probadas con el emulador o la consola `[fb]`

## Fase 3 — Cooperativo en sincronía (≈ 2 semanas)

- [ ] 3.1 `P0 D3` PRNG determinista propio (`src/core/prng.js`, mulberry32) con pruebas `[sync]`
- [ ] 3.2 `P0 D4` Reloj compartido: `.info/serverTimeOffset` y cuenta atrás hasta `startAt` `[sync]`
- [ ] 3.3 `P0 D5` Refactor de `Formation` a movimiento determinista `f(seed, wave, t)` con pruebas de igualdad entre dos instancias `[sync][loop]`
- [ ] 3.4 `P0 D3` Disparos enemigos deterministas desde la semilla `[sync]`
- [ ] 3.5 `P0 D3` `syncService.js`: publicar posición propia a 10 Hz solo si cambió `[sync]`
- [ ] 3.6 `P0 D4` Nave del compañero con buffer de interpolación (100 ms) `[sync]`
- [ ] 3.7 `P0 D3` Eventos `shot` (cosméticos) para mostrar los disparos del compañero `[sync]`
- [ ] 3.8 `P0 D4` Eventos `kill`: reclamo por el jugador, adjudicación por el host (primero gana) con pruebas de la lógica pura `[sync]`
- [ ] 3.9 `P0 D4` Eventos `hit` y vidas por jugador escritas por el host `[sync]`
- [ ] 3.10 `P0 D3` Fin de oleada y de partida decididos por el host (`state`) `[sync][loop]`
- [ ] 3.11 `P1 D4` Reasignación del rol de host si el host se desconecta `[sync]`
- [ ] 3.12 `P1 D3` Avisos de "conexión inestable" y compañero desconectado `[sync]`
- [ ] 3.13 `P1 D2` Resultados de partida coop y guardado en ranking (solo host) `[fb]`
- [ ] 3.14 `P1 D2` Limpieza de la sala al finalizar `[sync]`
- [ ] 3.15 `P1 D3` Prueba manual documentada con 2 dispositivos reales y redes distintas `[sync]`

## Fase 4 — Pulido & Entrega universitaria (≈ 1 semana)

- [ ] 4.1 `P0 D2` Bloquear orientación vertical en la app (plugin `@capacitor/screen-orientation` o configuración de Android) `[arch]`
- [ ] 4.2 `P0 D2` Probar rendimiento en un teléfono real dentro del WebView (60 FPS en solo, sin tirones en coop)
- [ ] 4.3 `P0 D2` Medir tráfico real en la consola de Firebase y comparar con el presupuesto de `multiplayer_sync.md` §7
- [ ] 4.4 `P0 D2` Ícono y pantalla de arranque (splash) de la app
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