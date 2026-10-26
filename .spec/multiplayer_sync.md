# multiplayer_sync.md — Modelo de sincronización cooperativo

> Estado: **v1.1**. Aplica solo al modo coop (2 jugadores, extensible a 4). La v1.1 describe el modelo realmente implementado (ver §10, ADR-13) y sustituye al nodo `state` de la v1.0 por eventos del host.

## 1. Principios

1. **Mínimo tráfico**: se sincroniza lo que no se puede derivar; lo demás se simula localmente.
2. **Host autoritativo**: un jugador (el creador de la sala, o quien lo releva, §5) decide el fin de cada oleada, la oleada siguiente, las vidas compartidas y el fin de partida, y publica el puntaje oficial.
3. **Cada cliente es dueño de su nave**: solo él escribe su posición y detecta los impactos que recibe.
4. **Simulación atada al reloj del servidor**: ambos clientes avanzan la partida hasta el mismo tiempo de juego `t`, en pasos fijos, de modo que lo derivable de `(semilla, oleada, t)` coincide sin enviar nada.
5. **Tolerancia a desviaciones pequeñas**: es cooperativo; una diferencia visual de ~100 ms no cambia el resultado.

## 2. Reloj compartido

- Cada cliente escucha `.info/serverTimeOffset` y calcula `serverNow = Date.now() + offset`.
- Al iniciar, el host fija `meta/startAt = serverNow + 3000` (ms, hora del servidor) y `status = playing`. Es el instante cero de la partida.
- Mientras `serverNow < startAt` la pantalla de juego muestra la **cuenta atrás 3-2-1** y la simulación no avanza.
- `t` (tiempo de juego, s) = `(serverNow - startAt) / 1000`. Cada frame el juego avanza en **pasos fijos de 1/60 s** (el último paso es el resto, ≤ 1/30 s) hasta que `elapsed` alcanza `t`; con un tope de 30 pasos por frame para no bloquear un teléfono lento, que seguirá poniéndose al día en los frames siguientes. En coop el `dt` del `requestAnimationFrame` se ignora.
- La lógica de tiempo es pura (`src/core/gameClock.js`) y se prueba sin red.

## 3. Qué se simula localmente (determinista)

Aleatoriedad: **todo lo sincronizado usa el PRNG propio** `mulberry32` de `src/core/prng.js`; `Math.random()` solo se usa en lo que cada jugador vive por separado (caída de potenciadores, recompensa del jefe, estrellas). Cada flujo tiene su propia secuencia, derivada con `deriveSeed(seed, sal)`, para que lo que consume un cliente no altere a otro:

| Flujo | Sal | Consumidor |
|---|---|---|
| Disparos de la formación de la oleada `w` | `w` | `Formation` |
| Naves de la fase bonus de la oleada `w` | `0x1000 + w` | `BonusStage` |
| Peligros ambientales | `0x4000` | `Hazards` |

**Formación enemiga.** La posición de un enemigo es una función pura del tiempo desde el inicio de su oleada (`formationOffset`, en `src/core/formationPath.js`): barrido lateral + escalón vertical en cada rebote, calculados con los **límites de la rejilla completa** (no dependen de qué enemigos siguen vivos). El tiempo de la oleada es `elapsed - waveStartT`; `waveStartT` es el `t` del evento `phase` del host (§4.3). Los kamikazes abandonan la formación en un instante determinista y después persiguen localmente a la nave más cercana (diferencias visuales pequeñas; el daño lo decide cada víctima).

**Disparos de la formación.** `createShotSchedule({ seed, wave, interval })` produce la secuencia `(tiempo, índice de rejilla)`: el intervalo varía ±50 % y, si el enemigo elegido ya murió, se toma el siguiente vivo de la rejilla. Todos los clientes generan la misma secuencia, por lo que **no hay eventos de disparo enemigo de la formación**. Los disparos del **jefe** sí los emite el host (`enemy-shot`) porque su patrón apunta a la nave del host.

## 4. Qué se sincroniza

### 4.1 Estado continuo — posición del jugador
- Ruta: `rooms/{code}/players/{uid}`.
- Campos: `x` (normalizado 0..1), `ts` (ms del servidor, `ServerValue.TIMESTAMP`), `connected`.
- Frecuencia: **10 Hz** y **solo si `x` cambió** más de 0,002 desde el último valor publicado (`createPositionPublisher`, pura), más un **latido cada 2 s** aunque no cambie (permite detectar caídas silenciosas, §5). Se usa `update()` parcial, nunca reescribir el nodo.
- Receptor: guarda las muestras `(ts, x)` en un buffer y dibuja la nave del compañero **100 ms atrás** del reloj del servidor, interpolando entre las dos muestras que la rodean (`createInterpolationBuffer`, puro). Si el buffer se queda sin futuro mantiene la última posición (no extrapola).

### 4.2 Eventos discretos
- Ruta: `rooms/{code}/events/{pushId}` (los push IDs dan un orden total por tiempo).
- Cada cliente ignora sus propios eventos y aplica los del compañero en orden.

| `type` | Emisor | Campos | Significado |
|---|---|---|---|
| `shot` | jugador | `t, x, vx, damage` | Disparó. El compañero recrea la bala localmente (así ve las mismas colisiones y la sinergia de disparos), adelantada lo que habría avanzado durante el retraso del evento (`elapsed − t`, tope 0,25 s). |
| `enemy-shot` | host | `t, x, y, vx, vy, color?` | Disparo del jefe. |
| `kill` | jugador | `wave, enemyId, t, powerUpType?` | Reclama haber destruido ese enemigo. |
| `bonus-kill` | jugador | `wave, shipId, multiplier, t, powerUpType?` | Reclama una nave de la fase bonus. |
| `hit` | jugador | `t` | Su nave cayó (5 s de emergencia). |
| `revive` | jugador | `targetUid, t` | Rescató a su compañero y gastó una vida compartida. |
| `life-loss` | jugador | `t, consumedLife` | Su emergencia venció: nave eliminada. |
| `phase` | host | `kind, wave, t, score, lives, bossDefeated?` | Transición de fase (§4.3). |
| `state` | host | `t, score, lives, wave` | Vidas compartidas oficiales tras un rescate o una eliminación. |
| `game-over` | host | `t, score, wave` | Fin de la partida. |

### 4.3 Autoridad del host
No hay nodo `state`: el estado oficial viaja en los eventos del host, que heredan el orden de los push IDs (un `phase` llega siempre después de los `kill` que lo causaron).

- **Reclamos de baja (`kill`, `bonus-kill`).** Quien dispara destruye al enemigo de forma optimista y emite el reclamo. El host mantiene un libro (`createHostLedger`, puro): **el primero en llegar gana**, los duplicados se ignoran y no suman puntaje; el libro también lleva las bajas y puntos por jugador. Si la bala del compañero mata en mi simulación local, la baja se acredita a su dueño y **no la reclamo yo**: solo reclama (y suelta el potenciador) el jugador cuya bala disparó.
- **Fin de oleada.** Solo el host detecta que no quedan enemigos (o que el jefe/fase bonus terminó), suma el bonus, decide el siguiente paso (jefe cada 3 oleadas, fase bonus cada 5, si no oleada normal) y emite `phase { kind: 'wave' | 'boss' | 'bonus', wave, t, score, lives }`. Los clientes no inician transiciones: esperan el evento, adoptan `score` y `lives` oficiales y arrancan la fase con `waveStartT = t`. Si el jefe cae, `phase` lleva `bossDefeated: true` y cada cliente aplica su recompensa.
- **Vidas.** Los eventos `hit`, `revive` y `life-loss` los aplican ambos clientes; tras un rescate o una eliminación el host publica `state` con las vidas oficiales y el compañero las adopta. Solo se puede rescatar si queda al menos una vida.
- **Fin de partida.** El host decide (ambos pilotos eliminados o la formación alcanza la línea), cierra la sala (`meta/status = finished`) y emite `game-over { score, wave }`; el compañero muestra esos valores en Resultados.
- Los clientes **eliminan un enemigo visualmente** al ver el `kill` (y de forma optimista en su propio disparo).

## 5. Conexión y presencia

- Al unirse: `onDisconnect().update({connected:false})` sobre `players/{uid}`; al reconectar se vuelve a `true`.
- Cada cliente sigue `meta` (`hostUid`, `status`), `players` y `.info/connected` mediante un `ConnectionMonitor` puro que produce un aviso en pantalla:
  - propia conexión caída (`.info/connected`) o más de 5 s sin ninguna señal del compañero conectado → «Conexión inestable»;
  - compañero con `connected:false` → «Compañero desconectado»;
  - si no vuelve en **10 s** su nave se desactiva («Compañero fuera de la partida») y el que queda sigue jugando.
- **Desconexión del host:** el otro jugador (el de menor `uid` entre los conectados) lo releva escribiendo `meta/hostUid = su uid`. Las reglas solo lo permiten si el host actual figura con `connected:false`. Desde ese instante es el host: decide fases y fin de partida a partir de su estado local y emite los eventos del host.
- No hay reconexión a mitad de partida tras cerrar la app (fuera de alcance).

## 6. Ciclo de vida de una sala

1. Host: crea `rooms/{code}` con `meta` (hostUid, seed, status=lobby, createdAt) y su nodo en `players`.
2. Invitado: introduce el código → lee `meta` → se agrega a `players/{uid}`.
3. Ambos marcan `ready`; el host fija `meta/startAt = serverNow + 3000` y `status = playing`.
4. Juego (§3-4), con cuenta atrás hasta `startAt`.
5. Fin: el host escribe `status = finished` y guarda el puntaje en Firestore (`leaderboard`, `mode: 'coop'`, `players`) **solo el host**, una vez.
6. Limpieza (`roomRepository.deleteRoom`): el host borra `rooms/{code}` al salir de Resultados (por el botón o con «Atrás»). Las reglas también dejan borrarla a un jugador de la sala cuando el host figura desconectado (el último en salir). Al salir del lobby el host borra la sala y el invitado libera su plaza (`leaveLobby`); si el host cierra la sala, el invitado ve «El host cerró la sala». Salas con `createdAt` > 24 h pueden eliminarse manualmente (no hay Cloud Functions).
7. «Salir» a mitad de partida (tarea 3.16): confirmación «¿Salir de la partida?»; abandonar equivale a desconectarse (§5).

## 7. Presupuesto de tráfico (2 jugadores, 10 min)

| Flujo | Cálculo | Total aprox. |
|---|---|---|
| Posiciones | 2 jug × 10 Hz × ~80 B × 600 s (solo si se mueven) | ≤ 1 MB |
| Eventos shot | 2 jug × ~3/s × ~90 B × 600 s | ~0,3 MB |
| Eventos kill/hit/phase/state + disparos del jefe | ~0,5 /s | ~0,1 MB |
| **Total** | | **~1,5 MB por partida** |

Muy por debajo de los límites del plan Spark; el riesgo real son los **bucles de escritura por frame** y escuchar nodos grandes (ver `firebase_schema.md`). El contador de tráfico de `?debug` (tarea 4.3) mide el real.

## 8. Pruebas esperadas

- Unitarias: PRNG determinista (misma semilla → misma secuencia); `formationOffset` y `createShotSchedule` idénticas en dos instancias e independientes de las bajas.
- Unitarias: libro del host con reclamos duplicados de `kill` (solo suma una vez); reloj compartido; publicador de posición; buffer de interpolación; monitor de conexión.
- Integración en Node: dos `Game` conectados por un repositorio de salas en memoria con el mismo reloj avanzan oleadas, puntaje y fin de partida en sincronía.
- Manual (`docs/pruebas-coop.md`): dos dispositivos reales con redes distintas (Wi‑Fi y datos móviles); cortar la red de uno de los jugadores 5 s y restablecerla.

## 9. Fuera de alcance

Reconexión tras cierre de la app, anti-trampas (un cliente malicioso puede falsear `kill`; ver `firebase_schema.md`), más de 2 jugadores en el MVP.

## 10. Decisiones

**ADR-13 — Estado autoritativo en eventos del host, no en un nodo `state`.** Los eventos ya tienen orden total y los consumen ambos clientes con una sola suscripción; un nodo `state` obligaría a otra suscripción y a coordinar el orden entre `events` y `state` (una oleada podría anunciarse antes que la última baja). Se descarta reescribir la formación como función pura de `(semilla, oleada, t)` para jefes, kamikazes y peligros: se mantiene la simulación local con el reloj bloqueado al servidor y se sincronizan las decisiones del host.
