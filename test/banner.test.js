import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bannerFrame, drawBanner, VISUALS } from '../src/game/visuals.js';
import { Game } from '../src/game/Game.js';

test('la franja entra por la izquierda, se centra y sale por la derecha', () => {
  const width = 360;
  assert.equal(bannerFrame(0, width).offsetX, -width);
  let previous = -Infinity;
  for (let p = 0; p <= 0.25; p += 0.01) {
    const { offsetX } = bannerFrame(p, width);
    assert.ok(offsetX >= previous);
    previous = offsetX;
  }
  assert.equal(bannerFrame(0.25, width).offsetX, 0);
  assert.equal(bannerFrame(0.5, width).offsetX, 0);
  assert.equal(bannerFrame(0.75, width).offsetX, 0);
  assert.equal(bannerFrame(1, width).offsetX, width);
  assert.ok(bannerFrame(0.9, width).offsetX > 0);
});

test('con movimiento reducido no se desplaza y solo hace fundido', () => {
  assert.deepEqual(bannerFrame(0, 360, true), { offsetX: 0, alpha: 0 });
  assert.deepEqual(bannerFrame(0.5, 360, true), { offsetX: 0, alpha: 1 });
  assert.equal(bannerFrame(1, 360, true).alpha, 0);
});

test('drawBanner dibuja la franja y el texto centrados verticalmente', () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_t, name) => (...args) => { calls.push([name, ...args]); },
    set: (_t, name, value) => { calls.push(['set', name, value]); return true; },
  });
  drawBanner(ctx, { text: 'OLEADA 3', kind: 'wave' }, 0.5, { width: 360, height: 640 });
  const rect = calls.find(([name]) => name === 'fillRect');
  assert.equal(rect[2], 640 / 2 - VISUALS.BANNER_HEIGHT / 2);
  const text = calls.find(([name]) => name === 'fillText');
  assert.deepEqual(text.slice(0, 2), ['fillText', 'OLEADA 3']);
  assert.equal(text[2], 180);
});

test('cada oleada nueva lanza la franja de 0,5 s y la siguiente la sustituye', () => {
  const game = new Game({ random: () => 0.5 });
  assert.equal(game.banner.text, 'OLEADA 1');
  game.formation.enemies.forEach((enemy) => { enemy.dead = true; });
  game.update(0.01);
  assert.equal(game.wave, 2);
  assert.equal(game.banner.text, 'OLEADA 2');
  assert.equal(game.banner.age, 0);

  game.update(0.3);
  assert.ok(game.banner);
  game.update(0.25);
  assert.equal(game.banner, null);
});

test('la franja no avanza en pausa', () => {
  const game = new Game({ random: () => 0.5 });
  game.pause();
  game.update(2);
  assert.ok(game.banner);
  assert.equal(game.banner.age, 0);
});
