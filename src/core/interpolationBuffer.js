// Buffer de interpolación para la nave del compañero.
// Ver `.spec/multiplayer_sync.md` §4.1: se dibuja 100 ms atrás del reloj del servidor.

export const INTERPOLATION_DELAY_MS = 100;

/**
 * @param {{ delayMs?: number, maxSamples?: number }} [options]
 * @returns {{
 *   push(ts: number, x: number): boolean,
 *   sample(serverNow: number): number | null,
 *   latest(): number | null,
 *   clear(): void,
 *   readonly size: number,
 * }}
 */
export function createInterpolationBuffer({
  delayMs = INTERPOLATION_DELAY_MS,
  maxSamples = 32,
} = {}) {
  /** @type {{ ts: number, x: number }[]} */
  let samples = [];

  return {
    /** Añade una muestra `(ts del servidor, x)`. Descarta valores inválidos, repetidos o antiguos. */
    push(ts, x) {
      if (!Number.isFinite(ts) || !Number.isFinite(x)) return false;
      const last = samples.at(-1);
      if (last && ts <= last.ts) return false;
      samples.push({ ts, x });
      if (samples.length > maxSamples) samples = samples.slice(-maxSamples);
      return true;
    },

    /**
     * Posición interpolada en `serverNow - delayMs`. Antes de la primera muestra o después de la
     * última devuelve la más cercana (no extrapola). `null` si no hay muestras.
     */
    sample(serverNow) {
      if (samples.length === 0) return null;
      const target = serverNow - delayMs;
      const first = samples[0];
      const last = samples[samples.length - 1];
      if (target <= first.ts) return first.x;
      if (target >= last.ts) return last.x;
      let index = samples.length - 1;
      while (samples[index - 1].ts > target) index -= 1;
      const before = samples[index - 1];
      const after = samples[index];
      const ratio = (target - before.ts) / (after.ts - before.ts);
      return before.x + (after.x - before.x) * ratio;
    },

    /** Última posición recibida (sin retraso), p. ej. mientras el reloj no está sincronizado. */
    latest() {
      return samples.at(-1)?.x ?? null;
    },

    clear() {
      samples = [];
    },

    get size() {
      return samples.length;
    },
  };
}
