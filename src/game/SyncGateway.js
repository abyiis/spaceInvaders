/**
 * Puerto de red del juego. `Game` notifica aquí sus eventos locales sin saber
 * si hay red detrás. La implementación con Firebase vive en `src/net/`
 * (Fase 3); en modo solo se usa `NoopSyncGateway`.
 * Ver `.spec/architecture.md` §3.1.
 *
 * @typedef {Object} SyncGateway
 * @property {boolean} isCoop
 *   `true` si la partida está sincronizada con otro jugador.
 * @property {(x: number) => void} publishPlayerX
 *   Entrega la posición horizontal de la nave local, normalizada en [0, 1].
 *   Se llama cada frame; el gateway real decide cuándo escribir (10 Hz, solo si cambió).
 * @property {(t: number, x: number, damage?: number, vx?: number) => void} emitShot
 *   La nave local disparó en el tiempo de juego `t` (s) desde `x` normalizada.
 * @property {(wave: number, enemyId: number, t: number, powerUpType?: string | null) => void} emitKill
 *   Un impacto local destruyó al enemigo `enemyId` de la oleada `wave`.
 * @property {(t: number) => void} emitHit
 *   La nave local perdió una vida en el tiempo de juego `t` (s).
 * @property {{ kind: string, message: string, secondsLeft?: number }} [connectionStatus]
 *   Solo coop: estado de la conexión propia y del compañero (`ok`, `unstable`, `peer-offline`, `peer-gone`).
 * @property {Record<string, string>} [playerNames] Solo coop: alias de los jugadores por uid.
 * @property {{ snapshot(): object }} [traffic] Solo coop: contador estimado de tráfico (panel de depuración).
 * @property {number | null} [seed] Solo coop: semilla compartida de la sala.
 * @property {string | null} uid Identificador del jugador local.
 * @property {string | null} remoteUid Identificador del compañero.
 * @property {number | null} remoteX Posición horizontal del compañero normalizada.
 * @property {(handlers: { onEvent?: (id: string, event: object) => void, onHostChange?: (hostUid: string) => void }) => void} setHandlers
 *   Registra receptores de eventos remotos y del relevo de host.
 * @property {(targetUid: string, t: number) => void} emitRevive Publica un rescate cooperativo.
 * @property {(t: number, consumedLife: boolean) => void} emitLifeLoss Publica una eliminación definitiva.
 * @property {boolean} isHost `true` si este jugador es el host (autoridad de la partida).
 * @property {string | null} hostUid Identificador del host actual.
 * @property {(t: number, score: number, lives: number, wave: number) => void} emitState
 *   Solo el host: publica las vidas oficiales (y el puntaje) tras un rescate o una eliminación.
 * @property {(phase: { kind: 'wave' | 'boss' | 'bonus', wave: number, t: number, score: number,
 *   lives: number, bossDefeated?: boolean }) => void} emitPhase
 *   Solo el host: anuncia el inicio de una fase con el puntaje y las vidas oficiales.
 * @property {(t: number, score: number, wave: number, kills?: Record<string, number>) => void} emitGameOver
 *   Solo el host: anuncia el fin de la partida con el puntaje oficial.
 * @property {() => number | null} [gameTime]
 *   Solo coop: segundos de juego según el reloj del servidor (negativos hasta `startAt`),
 *   o `null` mientras el reloj no está sincronizado. Ver `.spec/multiplayer_sync.md` §2.
 * @property {() => void} dispose
 *   Libera suscripciones y temporizadores.
 */

/**
 * Implementación vacía para el modo individual: no usa red.
 * @implements {SyncGateway}
 */
export class NoopSyncGateway {
  get isCoop() {
    return false;
  }

  get uid() {
    return null;
  }

  get isHost() {
    return false;
  }

  get hostUid() {
    return null;
  }

  get remoteUid() {
    return null;
  }

  get remoteX() {
    return null;
  }

  setHandlers() {}

  publishPlayerX() {}

  emitShot() {}

  emitEnemyShot() {}

  emitKill() {}

  emitHit() {}

  emitRevive() {}

  emitLifeLoss() {}

  emitState() {}

  emitPhase() {}

  emitGameOver() {}

  emitBonusKill() {}

  dispose() {}
}