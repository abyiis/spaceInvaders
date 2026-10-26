# Space Coop (híbrida)

Juego estilo Space Invaders, arcade infinito por puntuación, con cooperativo en tiempo real (2 jugadores) sobre Firebase. Proyecto universitario desarrollado con **Spec-Driven Development**.

**Stack:** HTML5 Canvas + JavaScript + CSS · Vite · **Capacitor** (empaqueta la web como app Android/iOS) · Firebase Realtime Database · Cloud Firestore · Firebase Auth (anónima) · plan Spark (gratis).

> Es una app **híbrida**: el juego corre dentro de un WebView nativo que genera Capacitor. Se instala como APK/IPA, pero el código es web.

## Estructura

```
.spec/                       Especificaciones (fuente de verdad)
  architecture.md
  game_loop.md
  multiplayer_sync.md
  firebase_schema.md
  ui_screens.md
  visual_feedback.md
docs/                        Informe, guion de demostración, guía de entrega (APK) y guías de prueba manual
assets/                      Ícono y splash nativo generados (npm run assets)
scripts/                     Generador de recursos y bench de la simulación
TASKS.md                     Backlog por fases con checkboxes
PROMPT_FOR_AI_AGENT.md       Prompt maestro para Claude Code / Cursor / Copilot
firebase/                    Reglas de seguridad (RTDB y Firestore)
firebase.json
index.html                   Contenedor: <canvas> + capa de UI
capacitor.config.json
vite.config.js
src/
  main.js                    Arranque y bucle del juego
  lifecycle.js               Pausa al pasar la app a segundo plano
  effects.js                 Sonido (Web Audio) y vibración
  style.css
  core/                      Lógica pura (dificultad, colisiones, PRNG, reloj compartido, formación y disparos
                             deterministas, libro del host, relevo de host, interpolación, medidores)
  game/                      Simulación (oleadas, jefes, peligros, bonus, coop, powerUps, Starfield, input)
  net/                       Firebase tras interfaces (salas, puntajes, perfil, auth)
  ui/                        Pantallas HTML/CSS y router
test/                        Pruebas con node:test
```

## Puesta en marcha (Fase 0)

Requisitos: **Node ≥ 20**. Para la app Android: Android Studio (iOS requiere macOS + Xcode).

```bash
npm install
npm test            # 369 pruebas unitarias y de integración
npm run dev         # servidor de desarrollo; ábrelo en el navegador o desde el teléfono (misma Wi-Fi)
npm run build       # genera dist/
npm run test:rules  # reglas de Firebase con emuladores (Java + Firebase CLI)
npm run bench       # coste de CPU de la simulación
npm run assets      # regenera el ícono y el splash nativo en assets/
```

**Controles:** arrastra el dedo en horizontal (o usa ← → / A D) para mover la nave; dispara sola. Cada tres rondas aparece un jefe con dos fases; al derrotarlo recibes una vida y dos potenciadores. Cada cinco rondas hay un bonus de 15 segundos con naves inofensivas y combos de puntos. Asteroides, campos magnéticos y apagones alteran temporalmente el combate; kamikazes y unidades soporte se suman a las formaciones. En coop online, ambos pilotos pueden combinar disparos y rescatarse durante 5 segundos consumiendo una vida compartida; no hay rescate si el contador está en cero. La partida empieza con una cuenta atrás compartida, el host decide el fin de cada oleada y de la partida (y lo releva el otro jugador si se cae) y el botón ✕ o «Atrás» abren «¿Salir de la partida?». Si la partida termina en la primera ronda, los créditos aparecen como un easter egg antes de los resultados. Pausa con ⏸, Esc o P en solo; desde el menú puedes continuar o salir al inicio. Si la app pasa a segundo plano el juego se pausa; toca la pantalla para continuar. Hay sonidos sintetizados (se activan con el primer toque) y el teléfono vibra al recibir daño. El fondo es un campo de estrellas en parallax.

### Empaquetar como app Android

1. `capacitor.config.json` ya trae `appId` `co.edu.upb.spacecoop` y el splash nativo de 800 ms; cámbialo si prefieres otro **antes** del paso siguiente.
2. Añade la plataforma (una sola vez):
```bash
   npx cap add android
```
3. Cada vez que cambies el código web:
```bash
   npm run android      # build + cap sync + abre Android Studio
```
4. Ejecuta en un emulador o teléfono desde Android Studio, o genera el APK con *Build → Build Bundle(s) / APK(s)*.

La guía completa (ícono, splash, orientación y APK) está en `docs/entrega.md`.

## Firebase (tareas 0.8 – 0.10)

La tarea 2.3 añade el menú principal y el modo solo sin depender de Firebase. Las tareas 2.4–2.7 implementan la creación y unión a salas, el lobby en vivo y la presencia en RTDB. Para usarlas, registra una app **Web**, habilita **Authentication → Sign-in method → Anonymous** y configura `src/net/firebaseConfig.js`, exportando `firebaseConfig` e incluyendo el `databaseURL` de Realtime Database. Este archivo está versionado para compartir la configuración web del proyecto; no añadas credenciales privadas ni claves de servidor.

Firestore se necesita para guardar puntajes (tarea 2.8), consultar el ranking (tarea 2.9) y persistir el alias. Habilita Firestore en el proyecto de Google Cloud usado por la configuración web y publica las reglas de ambas bases en ese mismo proyecto:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only database,firestore --project <project-id>
```

Sustituye `<project-id>` por el ID del proyecto de `firebaseConfig.js`. La base RTDB debe estar creada en la región `us-central1`. No abras el acceso público: las reglas del repositorio restringen el uso a usuarios autenticados.

> **Importante:** las reglas del repositorio cambiaron en la Fase 3 (eventos del host, relevo de host, borrado de salas y ranking coop). Vuelve a desplegarlas antes de probar el coop; sin ellas fallará con `permission_denied`.

Para verificar las reglas localmente, instala Java y Firebase CLI (`npm install -g firebase-tools`) y ejecuta `npm run test:rules`. El comando inicia ambos emuladores, ejecuta las pruebas y los apaga; no despliega reglas ni accede a los datos del proyecto real.

El servicio de autenticación expone `authService.signIn()` y `authService.uid` desde `src/net/firebase.js`. La configuración Firebase se valida al importar ese módulo; el modo individual no lo importa y sigue funcionando sin configuración.

## Trabajo con un agente de IA

Abre el proyecto en tu agente y pídele:

> Lee `PROMPT_FOR_AI_AGENT.md` y sigue sus instrucciones.

El agente leerá los specs, tomará la siguiente tarea de `TASKS.md`, la implementará y la marcará como hecha.

## Estado actual

- Specs al día (`architecture` v1.8, `game_loop` v1.5, `multiplayer_sync` v1.1, `firebase_schema` v1.1, `ui_screens` v1.2).
- Fases 1, 2 y 2B completas salvo la revisión manual en Android (2B.13). **Fase 3 completa a nivel de código y pruebas** (tareas 3.1 – 3.14 y 3.16); la prueba manual con dos teléfonos (3.15) está documentada en `docs/pruebas-coop.md`.
- Fase 4: orientación vertical, panel de FPS y tráfico, ícono y splash generados, informe, guion de demo y guía de entrega listos; **pendientes** (necesitan Android Studio o teléfonos): generar `android/` y el APK (0.6, 0.7, 4.4 y 4.5) y medir rendimiento y tráfico reales (4.2 y 4.3). Ver `docs/`.
- Verificado: `npm test` (369 pruebas), `npm run test:rules` (9 pruebas con los emuladores de RTDB y Firestore) y `npm run build`.
- Las reglas de Firebase hay que **volver a desplegarlas** tras la Fase 3 (tarea 0.10).
- La app Capacitor todavía no se ha verificado en un emulador o dispositivo.
