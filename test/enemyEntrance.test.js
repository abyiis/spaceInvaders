import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entranceProgress, VISUALS } from '../src/game/visuals.js';
import { Bullet } from '../src/game/Bullet.js';
import { Game } from '../src/game/Game.js';

test('el progreso de entrada sube de 0 a 1 y se retrasa por fila y columna', () => {
  assert.equal(entranceProgress(0, 0, 0), 0);
  assert.equal(entranceProgress(VISUALS.ENTRANCE_DURATION, 0, 0), 1);
  assert.ok(entranceProgress(0.3, 0, 0) > entranceProgress(0.3, 2, 0));
  assert.ok(entranceProgress(0.3, 0, 0) > entranceProgress(0.3, 0, 5));
  assert.equal(entranceProgress(-1, 0, 0), 0);
});

test('toda la rejilla termina de entrar en 1,2 s o menos', () => {
  assert.equal(entranceProgress(1.2, 5, 5), 1);
});

test('una formación nueva nace en entrada y termina entera al cabo de 1,2 s', () => {
  const game = new Game({ random: () => 0.5 });
  assert.ok(game.formation.enemies.every((enemy) => enemy.entrance < 1));
  for (let i = 0; i < 72; i += 1) game.update(1 / 60);
  assert.ok(game.formation.enemies.every((enemy) => enemy.entrance === 1));
});

test('un enemigo que aún entra no recibe balas ni dispara', () => {
  const game = new Game({ random: () => 0.5 });
  const enemy = game.formation.enemies[0];
  game.bullets.push(new Bullet({ x: enemy.x, y: enemy.y, fromPlayer: true, vy: 0 }));
  game.player.fireCooldown = 1e9;
  game.update(0.001);
  assert.equal(enemy.dead, false);
  assert.equal(game.bullets.some((bullet) => bullet.fromPlayer), true);

  game.formation.nextShot = { time: 0, pick: 0 };
  game.formation.update(0.001);
  assert.equal(game.bullets.filter((bullet) => !bullet.fromPlayer).length, 0);
});

test('la entrada dibuja al enemigo desplazado hacia arriba y con opacidad parcial', () => {
  const game = new Game({ random: () => 0.5 });
  const enemy = game.formation.enemies[0];
  enemy.entrance = 0.2;
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_t, name) => (...args) => { calls.push([name, ...args]); },
    set: (_t, name, value) => { calls.push(['set', name, value]); return true; },
  });
  enemy.render(ctx);
  const translate = calls.find(([name]) => name === 'translate');
  assert.ok(translate[2] < 0 && translate[2] > -VISUALS.ENTRANCE_DROP);
  const alpha = calls.find(([name, prop]) => name === 'set' && prop === 'globalAlpha');
  assert.ok(alpha[2] > 0 && alpha[2] < 1);

  calls.length = 0;
  enemy.reducedMotion = true;
  enemy.render(ctx);
  assert.equal(calls.some(([name]) => name === 'translate'), false);
});
