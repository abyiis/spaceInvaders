// Estadísticas de fotogramas para medir el rendimiento en el teléfono (tarea 4.2).

/**
 * Ventana deslizante de duraciones de frame.
 *
 * @param {{ windowMs?: number, slowFrameMs?: number }} [options]
 *   `slowFrameMs`: a partir de cuántos ms un frame cuenta como lento (60 FPS ≈ 16,7 ms; el
 *   umbral por defecto tolera una pequeña irregularidad antes de contarlo como tirón).
 * @returns {{
 *   frame(timestampMs: number): void,
 *   snapshot(): { fps: number, averageMs: number, worstMs: number, slowPercent: number, frames: number },
 *   reset(): void,
 * }}
 */
export function createFrameStats({ windowMs = 5000, slowFrameMs = 20 } = {}) {
  /** @type {{ at: number, duration: number }[]} */
  let samples = [];
  let previous = null;

  return {
    /** Registra un frame de `requestAnimationFrame` con su marca de tiempo (ms). */
    frame(timestampMs) {
      if (previous !== null && timestampMs > previous) {
        samples.push({ at: timestampMs, duration: timestampMs - previous });
        const oldest = timestampMs - windowMs;
        if (samples[0].at < oldest) samples = samples.filter((sample) => sample.at >= oldest);
      }
      previous = timestampMs;
    },

    snapshot() {
      if (samples.length === 0) {
        return { fps: 0, averageMs: 0, worstMs: 0, slowPercent: 0, frames: 0 };
      }
      const total = samples.reduce((sum, sample) => sum + sample.duration, 0);
      const worstMs = samples.reduce((worst, sample) => Math.max(worst, sample.duration), 0);
      const slow = samples.filter((sample) => sample.duration > slowFrameMs).length;
      return {
        fps: (samples.length * 1000) / total,
        averageMs: total / samples.length,
        worstMs,
        slowPercent: (slow * 100) / samples.length,
        frames: samples.length,
      };
    },

    reset() {
      samples = [];
      previous = null;
    },
  };
}
