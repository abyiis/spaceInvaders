import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shakeOffset, VISUALS } from '../src/game/visuals.js';
import { Game } from '../src/game/Game.js';

test('el desplazamiento decae hasta cero y nunca pasa de 4 px', () => {
  const max = () => 0.999999;
  const start = shakeOffset({ age: 0 }, max);
  assert.ok(Math.abs(start.x) <= VISUALS.SHAKE_MAGNITUDE && start.x > 3.9);
  const mid = shakeOffset({ age: VISUALS.SHAKE_DURATION / 2 }, max);
  assert.ok(Math.abs(mid.x) < Math.abs(start.x));
  assert.deepEqual(shakeOffset({ age: VISUALS.SHAKE_DURATION }, max), { x: 0, y: 0 });
  assert.deepEqual(shakeOffset(null), { x: 0, y: 0 });
  for (let i = 0; i < 200; i += 1) {
    const { x, y } = shakeOffset({ age: 0.05 });
    assert.ok(Math.abs(x) <= VISUALS.SHAKE_MAGNITUDE && Math.abs(y) <= VISUALS.SHAKE_MAGNITUDE);
  }
});

test('perder una vida activa el temblor, dura 0,35 s y no consume el azar de la partida', () => {
  let draws = 0;
  const game = new Game({ random: () => { draws += 1; return 0.5; } });
  const before = draws;
  game.player.invulnerable = 0;
  assert.equal(game.player.hit(), true);
  assert.ok(game.shake);
  game.update(0.2);
  assert.ok(game.shake);
  game.update(0.2);
  assert.equal(game.shake, null);
  // Los dibujos del temblor usan su propio azar, no `game.random`.
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  game.shakeScreen();
  const drawsBeforeRender = draws;
  game.render(ctx);
  assert.equal(draws, drawsBeforeRender);
  assert.ok(before >= 0);
});

test('un impacto bloqueado por invulnerabilidad no hace temblar', () => {
  const game = new Game({ random: () => 0.5 });
  game.player.invulnerable = 1;
  assert.equal(game.player.hit(), false);
  assert.equal(game.shake, null);
});

test('con movimiento reducido no hay temblor', () => {
  const game = new Game({ random: () => 0.5 });
  game.reducedMotion = true;
  game.player.hit();
  assert.equal(game.shake, null);
});

test('el temblor mueve la escena pero deja fijo el HUD', () => {
  const game = new Game({ random: () => 0.5 });
  game.shake = { age: 0 };
  const events = [];
  const ctx = new Proxy({}, {
    get: (_t, name) => (...args) => {
      events.push([name, ...args]);
      return { addColorStop() {} };
    },
    set: () => true,
  });
  game.render(ctx);
  const names = events.map(([name]) => name);
  const hud = events.findIndex(([name, text]) => name === 'fillText' && String(text).startsWith('Puntos'));
  const translate = names.indexOf('translate');
  const restore = names.indexOf('restore');
  assert.ok(translate >= 0 && translate < restore);
  assert.ok(restore < hud, 'el HUD se dibuja tras restaurar el desplazamiento');
});

test('el temblor no avanza en pausa', () => {
  const game = new Game({ random: () => 0.5 });
  game.player.hit();
  game.pause();
  game.update(1);
  assert.equal(game.shake.age, 0);
});
