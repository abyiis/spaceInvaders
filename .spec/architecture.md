# architecture.md — Arquitectura general

> Estado: **v1.0 (fuente de verdad)**. Si el código y este documento difieren, se corrige primero el documento y luego el código (SDD).

## 1. Objetivo

Juego móvil estilo Space Invaders, arcade infinito por puntuación, con modo cooperativo en tiempo real de 2 jugadores (extensible a 4) sobre Firebase. Aplicación **híbrida**: se programa con HTML, CSS y JavaScript y se empaqueta como app instalable (Android/iOS) con Capacitor.

## 2. Stack

| Capa | Tecnología | Motivo |
|---|---|---|
| Juego | HTML5 `<canvas>` 2D + JavaScript (ES modules), sin librería de juegos | Space Invaders no requiere un motor; menos dependencias y lógica fácil de probar en Node. |
| Interfaz (menú, lobby, ranking, resultados) | HTML + CSS sobre el canvas | Pantallas estándar con CSS; aprovecha el carácter híbrido. |
| Empaquetado híbrido | **Capacitor** (WebView nativo) | Genera proyectos Android Studio / Xcode con el mismo código web. |
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
├── style.css                 # estilos globales y de pantallas
├── core/                     # lógica pura, sin DOM ni Firebase
│   ├── constants.js
│   ├── difficulty.js         # waveParams(w)
│   └── collision.js          # AABB
├── game/                     # simulación del juego
│   ├── Game.js               # estado, oleadas, colisiones, render(ctx)
│   ├── Player.js  Enemy.js  Bullet.js  Formation.js
│   └── input.js              # Pointer Events + teclado (único módulo game/ que toca el DOM)
├── net/        (Fase 2-3)    # acceso a Firebase tras interfaces
│   ├── firebase.js           # init + exports
│   ├── authService.js
│   ├── roomRepository.js
│   └── syncService.js
└── ui/         (Fase 2)      # pantallas HTML/CSS: menú, lobby, ranking, game over
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

## 6. Requisitos no funcionales

- 60 FPS en un gama media de 2020 dentro del WebView.
- Latencia percibida del compañero < 200 ms (con interpolación).
- Tráfico por jugador < 5 KB/s en partida.
- Sin assets externos en el MVP (formas dibujadas con Canvas); sprites y audio opcionales en Fase 4.
- Bloqueo de orientación vertical en la app empaquetada (Fase 4).

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
