# multiplayer_sync.md — Modelo de sincronización cooperativa

> Estado: **v1.0**. Aplica solo al modo coop (2 jugadores, extensible a 4).

## 1. Principios

1. **Mínimo tráfico**: se sincroniza lo que no se puede derivar; lo demás se simula localmente.
2. **Host autoritativo**: un jugador (el creador de la sala) decide vidas, puntaje, oleada y fin de partida.
3. **Cada cliente es dueño de su nave**: solo él escribe su posición.
4. **Tolerancia a desviaciones pequeñas**: es cooperativo; una diferencia visual de ~100 ms no cambia el resultado.

## 2. Reloj compartido

- Cada cliente lee `.info/serverTimeOffset` y calcula `serverNow = Date.now() + offset`.
- `meta/startAt` (ms, hora del servidor) es el instante cero de la partida. Todos arrancan cuando `serverNow >= startAt`.
- `t` (tiempo de juego en segundos) = `(serverNow - startAt) / 1000`.

## 3. Qué se simula localmente (determinista)

La **formación enemiga** es una función de `(seed, wave, t)`:

- Posición de cada enemigo = función pura del tiempo desde el inicio de su oleada (movimiento lateral + escalones calculados, no integrados frame a frame).
- Disparos enemigos: generador pseudoaleatorio con `seed + wave` produce la secuencia `(tiempo, enemigoId)`. Todos los clientes generan la misma secuencia.
- Requisito de implementación: usar un PRNG propio (p. ej. `mulberry32`) en `src/core/prng.js`. **No** usar `Math.random()` para lo sincronizado.
- El movimiento debe calcularse con el tiempo del servidor, no con `dt` acumulado, para evitar deriva.

## 4. Qué se sincroniza

### 4.1 Estado continuo — posición del jugador
- Ruta: `rooms/{code}/players/{uid}`.
- Campos: `x` (normalizado 0..1), `ts` (ms servidor), `connected`.
- Frecuencia: **10 Hz** y **solo si `x` cambió** más de 0,002. Usar `update()` parcial, nunca reescribir el nodo completo.
- Receptor: interpola entre los dos últimos estados con 100 ms de retraso de render (buffer de interpolación).

### 4.2 Eventos discretos
- Ruta: `rooms/{code}/events/{pushId}` (push IDs ordenados por tiempo).
- Tipos:

| `type` | Emisor | Campos | Significado |
|---|---|---|---|
| `shot` | jugador | `uid, t, x` | Disparó en el tiempo de juego `t` desde `x`. Solo cosmético para el compañero (la bala se simula localmente). |
| `kill` | jugador | `uid, wave, enemyId, t` | Reclama haber destruido ese enemigo. |
| `hit` | jugador | `uid, t` | Su nave recibió una bala enemiga. |

- El cliente **no** descarga eventos antiguos: escucha con `limitToLast(1)` / `startAt(lastKey)` y descarta eventos con `t` anterior a la oleada actual.

### 4.3 Estado autoritativo (solo escribe el host)
- Ruta: `rooms/{code}/state`.
- Campos: `wave`, `score`, `status` (`lobby|playing|finished`), `lives/{uid}`, `killed/{wave}/{enemyId}: true`.
- El host procesa los eventos:
  - `kill`: si `killed/{wave}/{enemyId}` no existe → lo marca, suma 10 al `score`. **El primero en llegar gana**; reclamos duplicados se ignoran.
  - `hit`: resta una vida a `lives/{uid}` (respetando invulnerabilidad de 1,5 s).
  - Si no quedan enemigos sin marcar en la oleada → incrementa `wave` y suma bonus.
  - Si ambos sin vidas o formación alcanza la línea → `status = finished`.
- Los clientes **eliminan un enemigo visualmente** cuando ven `killed/{wave}/{enemyId}` (y de forma optimista en su propio disparo).

## 5. Conexión y presencia

- Al unirse: `onDisconnect().update({connected:false})` sobre `players/{uid}`.
- Desconexión del compañero: se muestra aviso; si no vuelve en 10 s, su nave se desactiva.
- **Desconexión del host**: el otro jugador detecta `connected:false` del host y asume el rol (`meta/hostUid = su uid`) leyendo el último `state`. Si no es posible, `status = finished` y se guarda el puntaje.
- Si un cliente tarda > 5 s sin recibir cambios de `players/{peer}`, se muestra “conexión inestable”.

## 6. Ciclo de vida de una sala

1. Host: crea `rooms/{code}` con `meta` (hostUid, seed, status=lobby, createdAt) y su nodo en `players`.
2. Invitado: introduce el código → lee `meta` → se agrega a `players/{uid}`.
3. Ambos marcan `ready`; el host fija `meta/startAt = serverNow + 3000` y `status = playing`.
4. Juego (sección 3-4).
5. Fin: host escribe `status = finished`; ambos clientes guardan el puntaje en Firestore (`leaderboard`) **solo el host**, una vez.
6. Limpieza: el host borra `rooms/{code}` al salir de los resultados; salas con `createdAt` > 24 h pueden eliminarse manualmente (no hay Cloud Functions).

## 7. Presupuesto de tráfico (2 jugadores, 10 min)

| Flujo | Cálculo | Total aprox. |
|---|---|---|
| Posiciones | 2 jug × 10 Hz × ~80 B × 600 s | ~1 MB |
| Eventos shot | 2 jug × ~3/s × ~90 B × 600 s | ~0,3 MB |
| Eventos kill/hit + estado | ~0,5 /s | ~0,1 MB |
| **Total** | | **~1,5 MB por partida** |

Muy por debajo de los límites del plan Spark; el riesgo real son los **bucles de escritura por frame** y escuchar nodos grandes (ver `firebase_schema.md`).

## 8. Pruebas esperadas

- Unitarias: PRNG determinista (misma semilla → misma secuencia), `formationPositionAt(seed, wave, t)` idéntica en dos instancias.
- Unitarias: lógica del host con eventos duplicados de `kill` (solo suma una vez).
- Manual: dos dispositivos reales con redes distintas (Wi‑Fi y datos móviles).
- Manual: cortar la red de uno de los jugadores 5 s y restablecerla.
