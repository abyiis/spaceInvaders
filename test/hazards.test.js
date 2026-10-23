import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C } from '../src/core/constants.js';
import { Game } from '../src/game/Game.js';
import { Bullet } from '../src/game/Bullet.js';
import { Hazards, asteroidOverlapsBox } from '../src/game/Hazards.js';

const constantRandom = () => 0.5;

test('los eventos ambientales aparecen de forma aleatoria y duran un tiempo limitado', () => {
  const game = new Game({
    random: constantRandom,
    hazardsRandom: () => 0,
  });
  const hazards = new Hazards(game, () => 0);

  hazards.nextEventIn = 0;
  hazards.update(0.01);
  assert.equal(hazards.active.type, 'asteroids');
  assert.ok(hazards.active.remaining <= 13);

  hazards.update(hazards.active.remaining + 0.01);
  assert.equal(hazards.active, null);
  assert.ok(hazards.nextEventIn > 0);
});

test('la lluvia de asteroides genera rocas que caen y desaparecen al salir del lienzo', () => {
  const game = new Game({
    random: constantRandom,
    hazardsRandom: () => 0.5,
  });
  const hazards = new Hazards(game, () => 0.5);
  hazards.active = { type: 'asteroids', age: 0, remaining: 10 };

  hazards.update(0.01);
  assert.equal(hazards.asteroids.length, 1);
  assert.ok(hazards.asteroids[0].y > -hazards.asteroids[0].radius);
  hazards.asteroids[0].y = game.height + 20;
  hazards.update(0.01);
  assert.equal(hazards.asteroids.length, 0);
});

test('el campo magnético curva los proyectiles del jugador', () => {
  const game = new Game({ random: constantRandom });
  game.hazards.active = { type: 'magnetic', age: 0, remaining: 10 };
  const bullet = new Bullet({
    x: game.width / 2 - 50,
    y: game.height / 2,
    fromPlayer: true,
    vx: 0,
    vy: -100,
  });
  game.bullets.push(bullet);

  game.update(0.1);

  assert.ok(bullet.vx > 0);
  assert.ok(bullet.x > game.width / 2 - 50);
});

test('un asteroide impacta al jugador y destruye enemigos al colisionar', () => {
  const game = new Game({ random: constantRandom });
  const lives = game.lives;
  game.hazards.asteroids.push({
    x: game.player.x,
    y: game.player.y,
    radius: 12,
    vx: 0,
    vy: 0,
    rotation: 0,
    spin: 0,
    dead: false,
  });

  game.update(0.001);
  assert.equal(game.lives, lives - 1);
  assert.equal(game.hazards.asteroids.length, 0);

  const enemy = game.formation.enemies[0];
  game.hazards.asteroids.push({
    x: enemy.x,
    y: enemy.y,
    radius: 12,
    vx: 0,
    vy: 0,
    rotation: 0,
    spin: 0,
    dead: false,
  });
  game.update(0.001);
  assert.equal(enemy.dead, true);
  assert.equal(game.score, C.SCORE_PER_ENEMY);
});

test('la colisión circular respeta los límites de la hitbox rectangular', () => {
  const asteroid = { x: 10, y: 10, radius: 5 };
  assert.equal(asteroidOverlapsBox(asteroid, { x: 14, y: 10, w: 8, h: 8 }), true);
  assert.equal(asteroidOverlapsBox(asteroid, { x: 20, y: 10, w: 8, h: 8 }), false);
});
