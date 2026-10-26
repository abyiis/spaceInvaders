/**
 * Panel de depuración con FPS y tráfico de red, para medir en el teléfono (tareas 4.2 y 4.3).
 * Se activa con `?debug=1`, con `localStorage['spacecoop.debug'] = '1'` o tocando 5 veces el
 * título de Créditos. No forma parte del juego: nunca se monta salvo que se pida.
 */

export const DEBUG_STORAGE_KEY = 'spacecoop.debug';
export const DEBUG_TOGGLE_EVENT = 'spacecoop:toggle-debug';

/**
 * ¿Debe arrancar con el panel visible?
 * @param {{ search?: string, storage?: { getItem(key: string): string | null } | null }} sources
 */
export function isDebugRequested({ search = '', storage = null } = {}) {
  if (new URLSearchParams(search).get('debug') === '1') return true;
  try {
    return storage?.getItem(DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * @param {number} bytesPerSecond
 * @returns {string}
 */
export function formatRate(bytesPerSecond) {
  return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`;
}

/**
 * Texto de cada línea del panel.
 * @param {{
 *   frames: { fps: number, averageMs: number, worstMs: number, slowPercent: number },
 *   traffic?: { sentPerSecond: number, receivedPerSecond: number, totalSent: number, totalReceived: number } | null,
 * }} stats
 * @returns {string[]}
 */
export function describeStats({ frames, traffic = null }) {
  const lines = [
    `${frames.fps.toFixed(0)} FPS · ${frames.averageMs.toFixed(1)} ms`,
    `peor ${frames.worstMs.toFixed(0)} ms · lentos ${frames.slowPercent.toFixed(1)} %`,
  ];
  if (traffic) {
    lines.push(`↑ ${formatRate(traffic.sentPerSecond)} · ↓ ${formatRate(traffic.receivedPerSecond)}`);
    lines.push(`total ↑ ${(traffic.totalSent / 1024).toFixed(1)} KB · ↓ ${(traffic.totalReceived / 1024).toFixed(1)} KB`);
  }
  return lines;
}

/**
 * Monta el panel y devuelve su función de desmontaje.
 *
 * @param {HTMLElement} parent
 * @param {{ getStats: () => Parameters<typeof describeStats>[0], intervalMs?: number,
 *   setIntervalFn?: typeof setInterval, clearIntervalFn?: typeof clearInterval }} options
 * @returns {() => void}
 */
export function mountDebugOverlay(parent, {
  getStats,
  intervalMs = 500,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}) {
  const panel = document.createElement('pre');
  panel.className = 'debug-overlay';
  panel.setAttribute('aria-hidden', 'true');
  const render = () => {
    panel.textContent = describeStats(getStats()).join('\n');
  };
  render();
  parent.append(panel);
  const timer = setIntervalFn(render, intervalMs);
  return () => {
    clearIntervalFn(timer);
    panel.remove();
  };
}
