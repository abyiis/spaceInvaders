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
 * @property {(t: number, x: number) => void} emitShot
 *   La nave local disparó en el tiempo de juego `t` (s) desde `x` normalizada.
 * @property {(wave: number, enemyId: number, t: number) => void} emitKill
 *   Un impacto local destruyó al enemigo `enemyId` de la oleada `wave`.
 * @property {(t: number) => void} emitHit
 *   La nave local perdió una vida en el tiempo de juego `t` (s).
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

  publishPlayerX() {}

  emitShot() {}

  emitKill() {}

  emitHit() {}

  dispose() {}
}