# firebase_schema.md — Esquema de datos y reglas

> Estado: **v1.1**. Las reglas ejecutables están en `firebase/database.rules.json` y `firebase/firestore.rules`. Este documento y esos archivos deben mantenerse idénticos en intención.

## 1. Realtime Database (partida en vivo)

```
rooms/
  {code}/                       # código de 5 caracteres, p. ej. "K7QX2"
    meta/
      hostUid:   string
      seed:      int            # semilla del PRNG compartido
      status:    "lobby" | "playing" | "finished"
      createdAt: int            # ms (ServerValue.timestamp)
      startAt:   int            # ms servidor; se fija al empezar
      maxPlayers: int           # 2 (MVP)
    players/
      {uid}/
        name:      string       # alias, máx. 16 caracteres
        x:         number       # 0..1
        ts:        int          # ms servidor de la última actualización
        ready:     bool
        connected: bool
    state/                      # RESERVADO, sin uso (ADR-13): el estado oficial viaja en eventos del host
                                # (state / phase / game-over). Solo escribe el host.
      wave:   int
      score:  int
      status: string
      lives/{uid}: int          # 0..3
      killed/{wave}/{enemyId}: true
    events/
      {pushId}/
        type: "shot" | "enemy-shot" | "kill" | "bonus-kill" | "hit" | "revive"
            | "life-loss" | "state" | "phase" | "game-over"
        uid:  string
        t:    number            # tiempo de juego (s)
        x, y: number            # shot / enemy-shot (normalizados 0..1)
        vx, vy: number          # shot / enemy-shot
        damage: int             # shot (1..3)
        wave: int               # kill / bonus-kill / state / phase
        enemyId: int            # solo kill
        shipId, multiplier: int # solo bonus-kill
        powerUpType: string     # kill / bonus-kill (potenciador soltado)
        targetUid: string       # solo revive
        consumedLife: bool      # solo life-loss
        score, lives: int       # eventos del host (state / phase / game-over)
```

### Reglas (resumen de intención)

| Ruta | Lectura | Escritura |
|---|---|---|
| `rooms` (listado) | ❌ nunca | ❌ |
| `rooms/{code}` | usuario autenticado (el código actúa como secreto) | — |
| `rooms/{code}/meta` | autenticado | crear: cualquier autenticado si no existe; modificar: solo `hostUid`, o un jugador de la sala que pase a ser `hostUid` mientras el host figura con `connected: false` (relevo; la semilla no puede cambiar) |
| `rooms/{code}/players/{uid}` | autenticado | solo `auth.uid == uid` |
| `rooms/{code}/state` | autenticado | solo `meta/hostUid` |
| `rooms/{code}/events/{id}` | autenticado | autenticado con `uid == auth.uid` (solo crear, no editar); los tipos `state`, `phase`, `game-over` y `enemy-shot` solo los puede firmar `meta/hostUid` |

Validaciones: `x` en [0,1]; `type` en el conjunto permitido; `name` ≤ 16 caracteres; `lives` en [0,3] en `state/` y en [0,99] en los eventos (un jefe derrotado concede vidas extra); `score` en [0, 1.000.000].

> Limitación conocida (aceptada en MVP): sin Cloud Functions, un cliente malicioso podría falsear eventos `kill`. El proyecto es universitario; no se implementa anti-trampas.

### Índices
- `events` se consulta por orden de clave (push ID); no requiere índice adicional.

## 2. Cloud Firestore (datos persistentes de baja frecuencia)

```
users/{uid}
  displayName: string
  createdAt:   timestamp
  bestScore:   int
  gamesPlayed: int

leaderboard/{docId}
  uid:       string
  name:      string
  score:     int
  mode:      "solo" | "coop"
  wave:      int
  players:   array<string>   # uids (coop); el documento lo crea el host (uid == auth.uid) y debe figurar en la lista
                             # name (coop): alias de ambos jugadores, «A y B» (hasta 40 caracteres)
  createdAt: timestamp
```

### Reglas (resumen de intención)

| Ruta | Lectura | Escritura |
|---|---|---|
| `users/{uid}` | solo el dueño | solo el dueño |
| `leaderboard/{id}` | cualquier autenticado | **crear**: autenticado con `uid == auth.uid`, `score` entero ≥ 0 y ≤ 1.000.000 y, si `mode == 'coop'`, `players` lista de entre 2 y 4 uids que incluye a `auth.uid`; **actualizar/borrar**: nadie |

### Consulta de ranking
- `leaderboard` ordenado por `score` descendente, `limit(20)`. Índice simple automático; para filtrar por `mode` + ordenar por `score` Firestore pedirá un índice compuesto (crearlo desde el enlace del error).

## 3. Límites del plan gratuito (Spark) y presupuesto

| Recurso | Límite Spark | Uso esperado |
|---|---|---|
| RTDB conexiones simultáneas | 100 | 1 por dispositivo; demo con ≤ 20 |
| RTDB almacenamiento | 1 GB | < 5 MB (se limpian salas) |
| RTDB descarga mensual | ~10 GB | < 100 MB en desarrollo |
| Firestore lecturas/día | ~50.000 | ranking: ~20 por consulta |
| Firestore escrituras/día | ~20.000 | 1-2 por partida |

> Verificar los valores vigentes en la consola de Firebase antes de la entrega; Google puede modificarlos.

## 4. Buenas prácticas obligatorias

1. Nunca escribir en RTDB desde `update()` por frame; usar temporizador de 100 ms.
2. Escuchar rutas estrechas (`players`, `state`, `events` con límite), nunca `rooms/{code}` completa en partida.
3. Usar `update()` con rutas multi‑ubicación en vez de reescribir nodos.
4. Cancelar suscripciones (la función de cancelación devuelta por `onValue()`/`onChildAdded()`) al salir de la sala.
5. Región de RTDB: la más cercana a los usuarios (para Colombia, `us-central1`).
