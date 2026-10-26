// Contador de tráfico de red del cooperativo para compararlo con el presupuesto (tarea 4.3).
// Es una estimación hecha en el cliente (ruta + carga JSON + un margen de protocolo); la cifra
// oficial es la de la pestaña Usage de la consola de Firebase.

/** Margen por mensaje para el encabezado del protocolo de Realtime Database. */
export const MESSAGE_OVERHEAD_BYTES = 16;

/**
 * Bytes estimados de un mensaje con `path` y `payload`.
 * @param {string} path
 * @param {unknown} payload
 */
export function estimateMessageBytes(path, payload) {
  const body = payload === undefined ? '' : JSON.stringify(payload) ?? '';
  return path.length + body.length + MESSAGE_OVERHEAD_BYTES;
}

/**
 * @param {{ now?: () => number, windowMs?: number }} [options]
 * @returns {{
 *   record(direction: 'sent' | 'received', bytes: number, label?: string): void,
 *   snapshot(): {
 *     sentPerSecond: number, receivedPerSecond: number,
 *     averageSentPerSecond: number, averageReceivedPerSecond: number,
 *     totalSent: number, totalReceived: number, elapsedSeconds: number,
 *     byLabel: Record<string, { sent: number, received: number }>,
 *   },
 *   projectedBytes(seconds: number): number,
 *   reset(): void,
 * }}
 */
export function createTrafficMeter({ now = Date.now, windowMs = 10_000 } = {}) {
  let startedAt = null;
  let totals = { sent: 0, received: 0 };
  let byLabel = {};
  /** @type {{ at: number, direction: string, bytes: number }[]} */
  let recent = [];

  const trim = (time) => {
    const oldest = time - windowMs;
    if (recent.length > 0 && recent[0].at < oldest) recent = recent.filter((entry) => entry.at >= oldest);
  };

  return {
    record(direction, bytes, label = 'otros') {
      if ((direction !== 'sent' && direction !== 'received') || !Number.isFinite(bytes) || bytes <= 0) return;
      const time = now();
      if (startedAt === null) startedAt = time;
      totals[direction] += bytes;
      byLabel[label] ??= { sent: 0, received: 0 };
      byLabel[label][direction] += bytes;
      recent.push({ at: time, direction, bytes });
      trim(time);
    },

    snapshot() {
      const time = now();
      trim(time);
      const elapsedSeconds = startedAt === null ? 0 : Math.max((time - startedAt) / 1000, 0.001);
      const windowSeconds = Math.min(windowMs / 1000, Math.max(elapsedSeconds, 1));
      const inWindow = (direction) => recent
        .filter((entry) => entry.direction === direction)
        .reduce((sum, entry) => sum + entry.bytes, 0);
      return {
        sentPerSecond: inWindow('sent') / windowSeconds,
        receivedPerSecond: inWindow('received') / windowSeconds,
        averageSentPerSecond: elapsedSeconds === 0 ? 0 : totals.sent / elapsedSeconds,
        averageReceivedPerSecond: elapsedSeconds === 0 ? 0 : totals.received / elapsedSeconds,
        totalSent: totals.sent,
        totalReceived: totals.received,
        elapsedSeconds,
        byLabel: JSON.parse(JSON.stringify(byLabel)),
      };
    },

    /** Bytes (enviados + recibidos) que supondría mantener el ritmo medio durante `seconds`. */
    projectedBytes(seconds) {
      const { averageSentPerSecond, averageReceivedPerSecond } = this.snapshot();
      return (averageSentPerSecond + averageReceivedPerSecond) * seconds;
    },

    reset() {
      startedAt = null;
      totals = { sent: 0, received: 0 };
      byLabel = {};
      recent = [];
    },
  };
}
