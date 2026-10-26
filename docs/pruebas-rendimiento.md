# Pruebas de rendimiento y tráfico (tareas 4.2 y 4.3)

Estas pruebas necesitan un teléfono real y, para el tráfico, la consola de Firebase. Aquí se deja el procedimiento, las herramientas que trae la app y las tablas donde anotar lo medido. Mientras las tablas estén vacías, las tareas 4.2 y 4.3 de `TASKS.md` quedan sin marcar.

## 1. Rendimiento (tarea 4.2)

**Objetivo** (`architecture.md` §6): 60 FPS en un gama media de 2020 dentro del WebView en solo y sin tirones en coop.

### 1.1 Coste de la lógica (referencia sin teléfono)

`npm run bench` simula 10 minutos de partida en solitario con un piloto simple y mide cuánto tarda `Game.update()` y cuántas llamadas de dibujo pide `Game.render()` por frame. No pinta nada, así que es una cota inferior: sirve para detectar regresiones de la lógica entre versiones, no para sustituir la prueba en el teléfono.

Medición de referencia en el equipo de desarrollo (Node 24, 36 000 frames):

| Parte | Media | p99 | Máximo |
|---|---|---|---|
| `update` | 0,007 ms | 0,06 ms | 3,0 ms |
| `render` (solo llamadas, sin canvas real) | 0,014 ms | 0,14 ms | 2,8 ms |

Llamadas de dibujo por frame: ~150. El presupuesto de un frame a 60 FPS es 16,67 ms, de modo que el coste está en el dibujo real del canvas y en el WebView, que solo se mide en el teléfono.

### 1.2 Panel de FPS en el teléfono

La app trae un panel (arriba a la izquierda) con FPS, duración media de frame, peor frame y porcentaje de frames lentos (> 20 ms) de los últimos 5 s. Se activa de tres formas:

- Versión web: abrir con `?debug=1`, p. ej. `http://<ip-del-pc>:5173/?debug=1` con `npm run dev` (el teléfono en la misma Wi‑Fi).
- App empaquetada: **tocar 5 veces seguidas el título «CRÉDITOS»** (menos de 3 s); se vuelve a ocultar repitiendo el gesto.
- `localStorage['spacecoop.debug'] = '1'` desde las herramientas de desarrollo remotas (`chrome://inspect`).

### 1.3 Procedimiento

1. Instalar la versión de producción (`npm run build` + APK de la tarea 4.5): el modo desarrollo de Vite penaliza.
2. Activar el panel, cerrar el resto de apps y poner el teléfono con el ahorro de batería desactivado.
3. **Solo:** jugar 5 minutos incluyendo un jefe (oleada 3), la fase bonus (oleada 5) y un campo magnético o lluvia de asteroides. Anotar FPS, peor frame y % de lentos al llegar a cada hito.
4. **Coop:** repetir con dos teléfonos (ver `docs/pruebas-coop.md`), anotando los valores del teléfono más lento y si se notan tirones al aparecer el jefe o muchos disparos.
5. Si se baja de 55 FPS de forma sostenida: capturar un perfil con `chrome://inspect` → *Performance* y mirar primero `render` (sombras `shadowBlur`, gradientes del campo magnético y partículas son los candidatos).

### 1.4 Resultados

| Fecha | Teléfono (modelo, Android) | Modo | FPS medios | Peor frame | % lentos | Tirones notados | Veredicto |
|---|---|---|---|---|---|---|---|
| _pendiente_ | | | | | | | |

## 2. Tráfico de red (tarea 4.3)

**Objetivo** (`multiplayer_sync.md` §7 y `architecture.md` §6): unos **1,5 MB por partida de 10 minutos con 2 jugadores** y menos de **5 KB/s por jugador**.

### 2.1 Presupuesto de referencia

| Flujo | Cálculo (`multiplayer_sync.md` §7) | Total aprox. |
|---|---|---|
| Posiciones | 2 jug × 10 Hz × ~75 B × 600 s (solo si se mueven, más un latido cada 2 s) | ≤ 1 MB |
| Eventos `shot` | 2 jug × ~3,5/s × ~90 B × 600 s | ~0,4 MB |
| Eventos de bajas, golpes, fases y estado, y disparos del jefe | ~2 /s | ~0,5 MB |
| **Total** | | **~1,5 – 2 MB** (~3 KB/s por jugador entre subida y bajada) |

**Medición en el simulador** (dos clientes con piloto automático moviéndose sin parar durante 10 min, 21 oleadas, `CoopGateway.traffic`): cada cliente envía ~1,0 MB y recibe ~0,9 MB (1,7 KB/s ↑ y 1,5 KB/s ↓; posiciones ~0,5 MB y eventos ~0,5 MB por cliente). El total descargado entre ambos ronda 1,9 MB: dentro del rango del presupuesto y ~3× por debajo del límite de 5 KB/s por jugador. La prueba automática `coopIntegration.test.js` vigila el límite de 5 KB/s.

### 2.2 Estimación en la propia app

En coop, el panel de depuración (sección 1.2) añade dos líneas con el tráfico **estimado** por el cliente (ruta + carga JSON + 16 B de protocolo): tasa reciente (10 s) enviada y recibida, y totales. El contador desglosa por categoría (`posición`, `eventos`); la estimación subestima el protocolo real, así que la cifra oficial es la de la consola.

### 2.3 Procedimiento con la consola de Firebase

1. Antes de la prueba, abrir la consola → *Realtime Database* → pestaña **Usage** y anotar los valores actuales de **Downloads** (bytes descargados) y **Connections**.
2. Jugar una partida coop de 10 minutos con dos teléfonos (`docs/pruebas-coop.md`), con el panel activo, y anotar al terminar el total estimado de cada teléfono.
3. Esperar unos minutos (la consola tarda en actualizar) y anotar la diferencia de **Downloads** respecto al paso 1. Es el tráfico real de la partida, ya que las descargas de RTDB incluyen lo que recibe cada cliente.
4. Comparar: descargas reales de la partida vs. ~1,5 MB; tasa media por jugador vs. 5 KB/s. Si se superan, revisar primero qué categoría pesa más en el desglose del panel.
5. Revisar en *Firestore* → *Usage* que la partida generó 1 escritura (la entrada del ranking del host).

### 2.4 Resultados

| Fecha | Duración | Estimado A (↑/↓ KB) | Estimado B (↑/↓ KB) | Descargas RTDB reales (KB) | Presupuesto (KB) | Veredicto |
|---|---|---|---|---|---|---|
| _pendiente_ | | | | | 1.500 – 2.000 | |
