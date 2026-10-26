// Reloj compartido de la partida cooperativa. Ver `.spec/multiplayer_sync.md` §2.

/** Margen entre el "Iniciar" del host y el instante cero de la partida. */
export const START_DELAY_MS = 3000;

/**
 * @param {{ now?: () => number }} [options] `now` devuelve el reloj local en ms (se inyecta para probar).
 */
export function createGameClock({ now = Date.now } = {}) {
  let offsetMs = null;
  let startAtMs = null;

  return {
    /** Diferencia servidor − local, de `.info/serverTimeOffset`. */
    setOffset(ms) {
      if (Number.isFinite(ms)) offsetMs = ms;
    },

    /** Instante cero de la partida, en ms de la hora del servidor. */
    setStartAt(ms) {
      startAtMs = Number.isFinite(ms) ? ms : null;
    },

    get startAt() {
      return startAtMs;
    },

    /** `true` cuando se conocen el desfase del servidor y el instante cero. */
    get ready() {
      return offsetMs !== null && startAtMs !== null;
    },

    /** Hora del servidor en ms, o `null` hasta conocer el desfase. */
    serverNow() {
      return offsetMs === null ? null : now() + offsetMs;
    },

    /** Segundos de juego desde `startAt` (negativos antes de empezar), o `null` si no está listo. */
    gameTime() {
      if (!this.ready) return null;
      return (now() + offsetMs - startAtMs) / 1000;
    },

    /** Segundos que faltan para empezar; 0 una vez comenzada la partida; `null` si no está listo. */
    countdown() {
      const time = this.gameTime();
      return time === null ? null : Math.max(0, -time);
    },
  };
}
