// Coste de CPU de la simulación del juego (sin pintar en un canvas real).
// Uso: npm run bench [minutos simulados]
//
// Mide cuánto tarda `Game.update()` por frame y cuántas operaciones de dibujo pide `Game.render()`.
// No sustituye a la prueba en un teléfono (tarea 4.2): da una cota del trabajo de la lógica y de
// la cantidad de dibujo por frame para comparar entre versiones.

import { performance } from 'node:perf_hooks';
import { Game } from '../src/game/Game.js';
import { mulberry32 } from '../src/core/prng.js';

const minutes = Number(process.argv[2]) || 10;
const FRAME = 1 / 60;
const frames = Math.round(minutes * 60 * 60);

const drawCalls = { total: 0 };
const ctx = new Proxy({}, {
  get: () => (...args) => {
    drawCalls.total += 1;
    return args.length === 0 ? undefined : { addColorStop() {} };
  },
  set: () => true,
});

const game = new Game({ random: mulberry32(2026), hazardsRandom: mulberry32(7), starsRandom: mulberry32(11) });
const updateTimes = [];
const renderTimes = [];
let restarts = 0;

for (let frame = 0; frame < frames; frame += 1) {
  // Piloto simple: zigzag amplio para que haya disparos, impactos y cambios de oleada.
  game.player.moveDir = Math.sin(frame / 90) > 0 ? 1 : -1;
  const updateStart = performance.now();
  game.update(FRAME);
  updateTimes.push(performance.now() - updateStart);

  const renderStart = performance.now();
  game.render(ctx);
  renderTimes.push(performance.now() - renderStart);

  if (game.isGameOver) {
    game.startNewGame();
    restarts += 1;
  }
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};
const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const row = (name, values) => `${name.padEnd(8)} media ${average(values).toFixed(4)} ms · p99 ${percentile(values, 0.99).toFixed(4)} ms · máx ${Math.max(...values).toFixed(4)} ms`;

console.log(`Simulación de ${minutes} min (${frames} frames, ${restarts} reinicios por Game Over)`);
console.log(row('update', updateTimes));
console.log(row('render', renderTimes));
console.log(`Llamadas de dibujo por frame: ${(drawCalls.total / frames).toFixed(1)}`);
console.log(`Presupuesto de un frame a 60 FPS: ${(FRAME * 1000).toFixed(2)} ms`);
