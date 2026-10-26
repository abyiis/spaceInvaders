// Decide cuándo escribir la posición propia en la red.
// Ver `.spec/multiplayer_sync.md` §4.1: 10 Hz y solo si la posición cambió.

export const POSITION_PUBLISH_INTERVAL_MS = 100;
export const POSITION_MIN_DELTA = 0.002;
/** Aunque no se mueva, se repite la última posición cada tanto para que el compañero sepa que sigue ahí. */
export const POSITION_HEARTBEAT_MS = 2000;

/**
 * @param {{
 *   publish: (x: number) => void,
 *   now?: () => number,
 *   intervalMs?: number,
 *   minDelta?: number,
 *   heartbeatMs?: number,
 * }} options
 * @returns {{ update(x: number): boolean, reset(): void }}
 *   `update` se llama en cada frame con `x` normalizada y devuelve `true` si publicó.
 */
export function createPositionPublisher({
  publish,
  now = Date.now,
  intervalMs = POSITION_PUBLISH_INTERVAL_MS,
  minDelta = POSITION_MIN_DELTA,
  heartbeatMs = POSITION_HEARTBEAT_MS,
}) {
  let lastX = null;
  let lastAt = -Infinity;

  return {
    update(x) {
      if (!Number.isFinite(x)) return false;
      const time = now();
      if (time - lastAt < intervalMs) return false;
      const unchanged = lastX !== null && Math.abs(x - lastX) <= minDelta;
      if (unchanged && time - lastAt < heartbeatMs) return false;
      lastX = x;
      lastAt = time;
      publish(x);
      return true;
    },

    reset() {
      lastX = null;
      lastAt = -Infinity;
    },
  };
}
