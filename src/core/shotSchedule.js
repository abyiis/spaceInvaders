// Calendario determinista de los disparos de la formación.
// Ver `.spec/multiplayer_sync.md` §3: todos los clientes generan la misma secuencia.

import { streamFor } from './prng.js';

/**
 * Secuencia infinita de disparos `(tiempo, elección)` de una oleada. Cada disparo consume
 * exactamente dos números del flujo de la oleada, así que la secuencia no depende de qué
 * enemigos siguen vivos ni de quién la consulte.
 *
 * @param {{ seed: number, wave: number, interval: number }} options
 *   `interval`: intervalo medio entre disparos (s); el real varía ±50 %.
 * @returns {{ next(): { time: number, pick: number } }}
 *   `time` en segundos de oleada; `pick` en [0, 1) para elegir al tirador sobre la rejilla.
 */
export function createShotSchedule({ seed, wave, interval }) {
  const random = streamFor(seed, wave);
  let time = 0;
  return {
    next() {
      time += interval * (0.5 + random());
      return { time, pick: random() };
    },
  };
}

/**
 * Elige al tirador: el enemigo de la rejilla que marca `pick` o, si ya no puede disparar,
 * el siguiente que sí pueda (en orden circular).
 *
 * @template T
 * @param {T[]} grid Enemigos en el orden de la rejilla (id ascendente).
 * @param {number} pick Valor en [0, 1) de `createShotSchedule`.
 * @param {(enemy: T) => boolean} canShoot
 * @returns {T | null}
 */
export function pickShooter(grid, pick, canShoot) {
  if (grid.length === 0) return null;
  const start = Math.min(grid.length - 1, Math.floor(pick * grid.length));
  for (let offset = 0; offset < grid.length; offset += 1) {
    const candidate = grid[(start + offset) % grid.length];
    if (canShoot(candidate)) return candidate;
  }
  return null;
}
