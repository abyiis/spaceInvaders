/**
 * Rectángulo centrado en (x, y).
 * @typedef {Object} Box
 * @property {number} x  Centro horizontal.
 * @property {number} y  Centro vertical.
 * @property {number} w  Ancho.
 * @property {number} h  Alto.
 */

/**
 * Intersección AABB entre dos rectángulos centrados.
 * Los bordes que solo se tocan no cuentan como colisión.
 * @param {Box} a
 * @param {Box} b
 * @returns {boolean}
 */
export function boxesOverlap(a, b) {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
    Math.abs(a.y - b.y) < (a.h + b.h) / 2
  );
}
