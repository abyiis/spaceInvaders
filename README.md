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
  core/                      Lógica pura (constantes, dificultad, colisiones)
  game/                      Simulación (Game, Player, Enemy, Bullet, Formation, Starfield, input)
test/                        Pruebas con node:test
```

## Puesta en marcha (Fase 0)

Requisitos: **Node ≥ 20**. Para la app Android: Android Studio (iOS requiere macOS + Xcode).

```bash
npm install
npm test            # 137 pruebas unitarias
npm run dev         # servidor de desarrollo; ábrelo en el navegador o desde el teléfono (misma Wi-Fi)
npm run build       # genera dist/
```

**Controles:** arrastra el dedo en horizontal (o usa ← → / A D) para mover la nave; dispara sola. Tras el Game Over, Resultados aparece después de 1,2 s; usa «Jugar de nuevo» para empezar otra partida. Pausa con ⏸, Esc o P; desde el menú puedes continuar o salir al inicio. Si la app pasa a segundo plano el juego se pausa; toca la pantalla para continuar. Hay sonidos sintetizados (se activan con el primer toque) y el teléfono vibra al recibir daño. El fondo es un campo de estrellas en parallax.

### Empaquetar como app Android

1. Cambia `appId` en `capacitor.config.json` por uno propio (p. ej. `co.edu.tuuniversidad.spacecoop`). Hazlo **antes** del paso siguiente.
2. Añade la plataforma (una sola vez):
```bash
   npx cap add android
```
3. Cada vez que cambies el código web:
```bash
   npm run android      # build + cap sync + abre Android Studio
```
4. Ejecuta en un emulador o teléfono desde Android Studio, o genera el APK con *Build → Build Bundle(s) / APK(s)*.

## Firebase (tareas 0.8 – 0.10)

La tarea 2.3 añade el menú principal y el modo solo sin depender de Firebase. Las tareas 2.4–2.7 implementan la creación y unión a salas, el lobby en vivo y la presencia en RTDB. Para usarlas, registra una app **Web**, habilita **Authentication → Sign-in method → Anonymous** y configura `src/net/firebaseConfig.js`, exportando `firebaseConfig` e incluyendo el `databaseURL` de Realtime Database. Este archivo está versionado para compartir la configuración web del proyecto; no añadas credenciales privadas ni claves de servidor.

Firestore se necesita para guardar puntajes (tarea 2.8), consultar el ranking (tarea 2.9) y persistir el alias. Habilita Firestore en el proyecto de Google Cloud usado por la configuración web y publica las reglas de ambas bases en ese mismo proyecto:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only database,firestore --project <project-id>
```

Sustituye `<project-id>` por el ID del proyecto de `firebaseConfig.js`. La base RTDB debe estar creada en la región `us-central1`. No abras el acceso público: las reglas del repositorio restringen el uso a usuarios autenticados.

Para verificar las reglas localmente, instala Java y Firebase CLI (`npm install -g firebase-tools`) y ejecuta `npm run test:rules`. El comando inicia ambos emuladores, ejecuta las pruebas y los apaga; no despliega reglas ni accede a los datos del proyecto real.

El servicio de autenticación expone `authService.signIn()` y `authService.uid` desde `src/net/firebase.js`. La configuración Firebase se valida al importar ese módulo; el modo individual no lo importa y sigue funcionando sin configuración.

## Trabajo con un agente de IA

Abre el proyecto en tu agente y pídele:

> Lee `PROMPT_FOR_AI_AGENT.md` y sigue sus instrucciones.

El agente leerá los specs, tomará la siguiente tarea de `TASKS.md`, la implementará y la marcará como hecha.

## Estado actual

- Specs v1.0 completos.
- Modo individual jugable (Fase 1, tareas 1.1 – 1.13 hechas (Fase 1 completa); ver `TASKS.md`).
- Fase 2B: router, Splash, Home, Créditos, Resultados, récord local y pausa implementados (tareas 2B.1 – 2B.12); queda pendiente la revisión manual completa en Android (2B.13).
- Firebase está integrado parcialmente: configuración inicial, autenticación anónima, menú, salas, lobby y presencia (tareas 2.1–2.7); guardado de puntaje y ranking top 20 (2.8–2.9); alias persistente en Firestore (2.10). Las reglas RTDB/Firestore se verifican con emuladores locales (2.11).
- Verificado: `npm test`, `npm run test:rules`, `npm run build` y `npm audit` (sin vulnerabilidades conocidas). La conexión a Firebase real todavía requiere prueba con Authentication anónima habilitada, bases creadas y reglas desplegadas.
- La app Capacitor todavía no se ha verificado en un emulador o dispositivo.