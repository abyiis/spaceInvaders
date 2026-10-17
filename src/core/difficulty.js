// Fórmulas de dificultad. Ver `.spec/game_loop.md` §4.

/**
 * @typedef {Object} WaveParams
 * @property {number} rows            Filas de enemigos.
 * @property {number} columns         Columnas de enemigos.
 * @property {number} speed           Velocidad horizontal de la formación (px/s).
 * @property {number} shootInterval   Intervalo medio entre disparos enemigos (s).
 */

/**
 * Devuelve los parámetros de la oleada `wave` (empieza en 1).
 * @param {number} wave
 * @returns {WaveParams}
 */
export function waveParams(wave) {
  const w = Math.max(Math.floor(wave), 1);
  return {
    rows: Math.min(3 + Math.floor((w - 1) / 3), 6),
    columns: 6,
    speed: Math.min(40 + 8 * (w - 1), 160),
    shootInterval: Math.max(1.4 - 0.08 * (w - 1), 0.45),
  };
}
