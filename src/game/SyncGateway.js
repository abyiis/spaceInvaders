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
 * @property {string | null} uid Identificador del jugador local.
 * @property {string | null} remoteUid Identificador del compañero.
 * @property {number | null} remoteX Posición horizontal del compañero normalizada.
 * @property {(handlers: object) => void} setHandlers Registra receptores de eventos remotos.
 * @property {(targetUid: string, t: number) => void} emitRevive Publica un rescate cooperativo.
 * @property {(t: number, consumedLife: boolean) => void} emitLifeLoss Publica una eliminación definitiva.
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

  emitBonusKill() {}

  dispose() {}
}