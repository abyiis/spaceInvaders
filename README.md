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
npm test            # 67 pruebas de la lógica del juego
npm run dev         # servidor de desarrollo; ábrelo en el navegador o desde el teléfono (misma Wi-Fi)
npm run build       # genera dist/
```

**Controles:** arrastra el dedo en horizontal (o usa ← → / A D) para mover la nave; dispara sola. Toca la pantalla (o Espacio/Enter) tras el Game Over para reiniciar. Si la app pasa a segundo plano el juego se pausa; toca la pantalla para continuar. Hay sonidos sintetizados (se activan con el primer toque) y el teléfono vibra al recibir daño. El fondo es un campo de estrellas en parallax.

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

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only database,firestore
```

Antes: crea el proyecto en la consola de Firebase, registra una app **Web**, habilita **Authentication → Anónimo**, crea **Realtime Database** (región `us-central1`) y **Firestore**. Guarda los valores web que proporciona la consola en `src/net/firebaseConfig.js` (ignorado por Git), exportados como `firebaseConfig`.

La integración de Firebase informa claramente si falta este archivo; el modo individual no lo importa y sigue funcionando sin configuración.

## Trabajo con un agente de IA

Abre el proyecto en tu agente y pídele:

> Lee `PROMPT_FOR_AI_AGENT.md` y sigue sus instrucciones.

El agente leerá los specs, tomará la siguiente tarea de `TASKS.md`, la implementará y la marcará como hecha.

## Estado actual

- Specs v1.0 completos.
- Modo individual jugable (Fase 1, tareas 1.1 – 1.13 hechas (Fase 1 completa); ver `TASKS.md`).
- Firebase **aún no integrado** en el código (Fase 2); `firebase` está declarado en `package.json`.
- Verificado al generar el proyecto: las 67 pruebas con `node --test` pasan.
- **No verificado**: `npm install`, `npm run build` y la app Capacitor (el entorno donde se generó no tenía acceso al registro de npm). Si `npm install` reporta conflictos de versiones, ajusta las versiones de `package.json` (Capacitor, Vite, Firebase) a las vigentes.