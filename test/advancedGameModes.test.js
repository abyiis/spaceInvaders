import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Boss } from '../src/game/Boss.js';
import { BonusStage, BONUS_STAGE_DURATION } from '../src/game/BonusStage.js';
import { Formation } from '../src/game/Formation.js';
import { Game } from '../src/game/Game.js';
import { Bullet } from '../src/game/Bullet.js';

const constantRandom = () => 0.5;

test('las formaciones incluyen kamikaze y soporte; el soporte consume escudo antes de vida', () => {
  const game = new Game({ random: constantRandom });
  game.formation = new Formation(game, 3);
  const enemies = game.formation.enemies;
  const kamikaze = enemies.find((enemy) => enemy.type === 'kamikaze');
  const support = enemies.find((enemy) => enemy.type === 'support');
  const nearby = enemies.find((enemy) => enemy.type === 'normal');

  assert.ok(kamikaze);
  assert.ok(support);
  support.x = nearby.x;
  support.y = nearby.y;
  game.formation.supportTimer = 0;
  game.formation.update(0.01);
  assert.ok(nearby.shieldTime > 0);

  const health = nearby.hp;
  assert.equal(nearby.hit(), false);
  assert.equal(nearby.hp, health);
  assert.equal(nearby.shieldTime, 0);
});

test('un kamikaze se separa y corrige su trayectoria hacia la posición del jugador', () => {
  const game = new Game({ random: constantRandom });
  game.formation = new Formation(game, 2);
  const kamikaze = game.formation.enemies.find((enemy) => enemy.type === 'kamikaze');
  game.player.x = kamikaze.x + 100;
  const originalY = kamikaze.y;
  kamikaze.diving = true;

  game.formation.update(0.1);

  assert.ok(kamikaze.x > game.player.x - 100);
  assert.ok(kamikaze.y > originalY);
});

test('el soporte del jefe regenera vida periódicamente y puede ser destruido', () => {
  const game = new Game({ random: constantRandom });
  const boss = new Boss(game, 3);
  boss.health = 5;
  boss.support.healTimer = 0.1;

  boss.update(0.2);

  assert.equal(boss.health, 6);
  boss.support.hp = 1;
  game.boss = boss;
  boss.update(0.001);
  const support = boss.support;
  game.bullets.push(new Bullet({
    x: support.x,
    y: support.y,
    fromPlayer: true,
    vy: 0,
  }));
  game.update(0.001);
  assert.equal(support.dead, true);
});

test('la fase bonus dura quince segundos, no dispara y aumenta el multiplicador por combos', () => {
  const game = new Game({ random: constantRandom });
  const stage = new BonusStage(game);
  assert.equal(stage.remaining, BONUS_STAGE_DURATION);
  stage.update(0.01);
  assert.ok(stage.ships.length > 0);
  assert.ok(stage.ships.every((ship) => ship.vx !== 0));
  assert.equal(stage.registerKill(), 1);
  assert.equal(stage.registerKill(), 1);
  assert.equal(stage.registerKill(), 1);
  assert.equal(stage.registerKill(), 2);
  stage.update(2);
  assert.equal(stage.registerKill(), 1);
});

test('completar la ronda cinco activa bonus y cada nave entrega puntuación y posibilidad de power-up', () => {
  const game = new Game({
    random: () => 0,
    hazardsRandom: () => 0.5,
  });
  game.wave = 5;
  game.formation.enemies.forEach((enemy) => { enemy.dead = true; });
  game.update(0.001);
  assert.ok(game.bonusStage);
  assert.equal(game.bonusStage.remaining, BONUS_STAGE_DURATION);

  game.random = () => 0;
  game.bonusStage.ships = [{
    x: 120,
    y: 150,
    w: 24,
    h: 16,
    vx: 0,
    dead: false,
  }];
  game.bullets.push(new Bullet({
    x: 120,
    y: 150,
    fromPlayer: true,
    vy: 0,
  }));
  game.update(0.001);

  assert.equal(game.score, 300);
  assert.equal(game.bonusStage.combo, 1);
  assert.equal(game.powerUps.length, 1);
});

test('en hitos coincidentes se derrota primero al jefe y luego comienza la fase bonus', () => {
  const game = new Game({ random: constantRandom });
  game.wave = 15;
  game.formation.enemies.forEach((enemy) => { enemy.dead = true; });
  game.update(0.001);
  game.update(2.01); // advertencia previa al jefe

  assert.ok(game.boss);
  assert.equal(game.pendingBonusStage, true);
  game.boss.health = 0;
  game.update(0.001);

  assert.equal(game.boss, null);
  assert.ok(game.bonusStage);
  assert.equal(game.wave, 15);
});

test('sobrecarga otorga daño doble a los proyectiles', () => {
  const game = new Game({ random: constantRandom });
  game.formation.entranceEnabled = false; // sin animación de entrada: los enemigos ya son golpeables
  const enemy = game.formation.enemies[0];
  enemy.hp = 2;
  game.bullets.push(new Bullet({
    x: enemy.x,
    y: enemy.y,
    fromPlayer: true,
    vy: 0,
    damage: 2,
  }));

  game.update(0.001);

  assert.equal(enemy.dead, true);
});
