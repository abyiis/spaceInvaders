import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawShieldHexagon, VISUALS } from '../src/game/visuals.js';
import { Game } from '../src/game/Game.js';

const recorder = () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_t, name) => (...args) => { calls.push([name, ...args]); },
    set: (_t, name, value) => { calls.push(['set', name, value]); return true; },
  });
  return { ctx, calls };
};
const vertices = (calls) => calls.filter(([name]) => name === 'moveTo' || name === 'lineTo');

test('el escudo es un hexágono de 6 vértices a radio 26 con el color del potenciador', () => {
  const { ctx, calls } = recorder();
  assert.equal(drawShieldHexagon(ctx, { x: 100, y: 500, remaining: 4, time: 0 }), true);
  const points = vertices(calls);
  assert.equal(points.length, 6);
  for (const [, px, py] of points) {
    assert.ok(Math.abs(Math.hypot(px, py) - VISUALS.SHIELD_RADIUS) < 1e-9);
  }
  assert.ok(calls.some(([name, prop, value]) => name === 'set' && prop === 'strokeStyle' && value === '#67f5d5'));
  assert.ok(calls.some(([name, x, y]) => name === 'translate' && x === 100 && y === 500));
});

test('sin escudo no se dibuja nada', () => {
  const { ctx, calls } = recorder();
  assert.equal(drawShieldHexagon(ctx, { x: 0, y: 0, remaining: 0, time: 0 }), false);
  assert.equal(calls.length, 0);
});

test('en el último 1,5 s parpadea y antes se ve fijo', () => {
  const visible = (remaining) => drawShieldHexagon(recorder().ctx, { x: 0, y: 0, remaining, time: 0 });
  assert.equal(visible(3), true);
  const states = [1.4, 1.3, 1.2, 1.1, 1.0, 0.9].map(visible);
  assert.ok(states.includes(true) && states.includes(false));
});

test('con movimiento reducido no rota', () => {
  const { ctx, calls } = recorder();
  drawShieldHexagon(ctx, { x: 0, y: 0, remaining: 4, time: 7, reducedMotion: true });
  const rotate = calls.find(([name]) => name === 'rotate');
  assert.equal(rotate[1], 0);
});

test('la nave con escudo dibuja el hexágono y no parpadea por el escudo', () => {
  const game = new Game({ random: () => 0.5 });
  game.player.shieldPowerUp = 4;
  const { ctx, calls } = recorder();
  game.player.render(ctx);
  assert.equal(vertices(calls).length, 3 + 6);
  const fills = calls.filter(([name, prop]) => name === 'set' && prop === 'fillStyle').map((c) => c[2]);
  assert.ok(fills.includes('#4fc3f7'));
  assert.ok(!fills.includes('rgba(79, 195, 247, 0.33)'));
});

test('tras un golpe la nave sigue parpadeando sin escudo', () => {
  const game = new Game({ random: () => 0.5 });
  game.player.invulnerable = 1.0; // floor(10) % 2 === 0 → fase apagada
  const { ctx, calls } = recorder();
  game.player.render(ctx);
  const fills = calls.filter(([name, prop]) => name === 'set' && prop === 'fillStyle').map((c) => c[2]);
  assert.ok(fills.includes('rgba(79, 195, 247, 0.33)'));
  assert.equal(vertices(calls).length, 3);
});
