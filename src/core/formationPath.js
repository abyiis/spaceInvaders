// Movimiento de la formación enemiga como función pura del tiempo.
// Ver `.spec/multiplayer_sync.md` §3 y `.spec/game_loop.md` §4.

/**
 * @typedef {Object} FormationPath
 * @property {number} speed     Velocidad horizontal (px/s).
 * @property {number} range     Recorrido libre del rectángulo de la rejilla entre las dos paredes (px).
 * @property {number} stepDown  Escalón vertical en cada rebote (px).
 */

/**
 * Desplazamiento de toda la formación respecto de su posición inicial `time` segundos
 * después de empezar la oleada. La rejilla parte centrada: recorre media distancia hasta la
 * primera pared y, desde ahí, el recorrido completo entre paredes. En cada rebote baja un escalón.
 * Usa los límites de la rejilla completa, así que no depende de qué enemigos siguen vivos.
 *
 * @param {FormationPath} path
 * @param {number} time Segundos desde el inicio de la oleada (negativos se tratan como 0).
 * @returns {{ dx: number, dy: number, bounces: number, direction: 1 | -1 }}
 */
export function formationOffset({ speed, range, stepDown }, time) {
  const distance = speed * Math.max(0, time);
  const half = range / 2;
  if (range <= 0 || speed <= 0) return { dx: 0, dy: 0, bounces: 0, direction: 1 };
  if (distance < half) return { dx: distance, dy: 0, bounces: 0, direction: 1 };

  const beyond = distance - half;
  const completedLegs = Math.floor(beyond / range);
  const bounces = completedLegs + 1;
  const withinLeg = beyond - completedLegs * range;
  const direction = bounces % 2 === 1 ? -1 : 1;
  const dx = direction === -1 ? half - withinLeg : -half + withinLeg;
  return { dx, dy: bounces * stepDown, bounces, direction };
}

/**
 * Recorrido libre de la rejilla: ancho útil de la pantalla menos el ancho de la rejilla.
 * @param {{ width: number, margin: number, columns: number, spacingX: number, enemyWidth: number }} layout
 */
export function formationRange({ width, margin, columns, spacingX, enemyWidth }) {
  const gridWidth = (columns - 1) * spacingX + enemyWidth;
  return Math.max(0, width - 2 * margin - gridWidth);
}
