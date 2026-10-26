import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C } from '../src/core/constants.js';
import { Bullet } from '../src/game/Bullet.js';
import { Game } from '../src/game/Game.js';
import { NoopSyncGateway } from '../src/game/SyncGateway.js';

class FakeCoopSync extends NoopSyncGateway {
  kills = [];

  bonusKills = [];

  get isCoop() { return true; }

  get isHost() { return true; }

  get uid() { return 'a'; }

  get remoteUid() { return 'b'; }

  setHandlers(handlers) { this.handlers = handlers; }

  emitKill(...args) { this.kills.push(args); }

  emitBonusKill(...args) { this.bonusKills.push(args); }
}

const newGame = () => {
  const sync = new FakeCoopSync();
  // random = 0 → todo enemigo destruido suelta un potenciador estándar.
  const game = new Game({ sync, random: () => 0 });
  game.player.fireCooldown = 1e9;
  game.player.invulnerable = 1e9;
  return { game, sync };
};

const shootAt = (game, enemy, ownerUid) => {
  game.bullets.push(new Bullet({
    x: enemy.x,
    y: enemy.y,
    fromPlayer: true,
    vy: 0,
    ownerUid,
  }));
  game.update(0.001);
};

test('una baja reclamada por el compañero se aplica una sola vez aunque el evento llegue repetido', () => {
  const { game, sync } = newGame();
  const enemy = game.formation.enemies[3];
  const claim = { type: 'kill', uid: 'b', wave: 1, enemyId: enemy.id, t: 0 };

  sync.handlers.onEvent('e1', claim);
  sync.handlers.onEvent('e2', claim);

  assert.equal(enemy.dead, true);
  assert.equal(game.score, C.SCORE_PER_ENEMY);
  assert.deepEqual(game.ledger.killsBy(), { b: 1 });
});

test('un reclamo de otra oleada se ignora', () => {
  const { game, sync } = newGame();
  const enemy = game.formation.enemies[0];
  sync.handlers.onEvent('e1', { type: 'kill', uid: 'b', wave: 7, enemyId: enemy.id, t: 0 });
  assert.equal(enemy.dead, false);
  assert.equal(game.score, 0);
});

test('mi baja se publica una vez; el reclamo posterior del compañero sobre el mismo enemigo no suma', () => {
  const { game, sync } = newGame();
  const enemy = game.formation.enemies[0];
  shootAt(game, enemy, 'a');
  assert.equal(game.score, C.SCORE_PER_ENEMY);
  assert.equal(sync.kills.length, 1);
  assert.equal(sync.kills[0][1], enemy.id);

  sync.handlers.onEvent('e1', { type: 'kill', uid: 'b', wave: 1, enemyId: enemy.id, t: 0 });
  assert.equal(game.score, C.SCORE_PER_ENEMY);
  assert.deepEqual(game.ledger.killsBy(), { a: 1 });
});

test('si la bala del compañero mata en mi simulación, la baja se acredita a él y no la reclamo yo', () => {
  const { game, sync } = newGame();
  const enemy = game.formation.enemies[1];
  shootAt(game, enemy, 'b');

  assert.equal(enemy.dead, true);
  assert.equal(game.score, C.SCORE_PER_ENEMY);
  assert.deepEqual(game.ledger.killsBy(), { b: 1 });
  assert.equal(sync.kills.length, 0);
  assert.equal(game.powerUps.length, 0);
});

test('el potenciador de una baja del compañero llega con su evento, una sola vez', () => {
  const { game, sync } = newGame();
  const enemy = game.formation.enemies[1];
  shootAt(game, enemy, 'b');
  const claim = { type: 'kill', uid: 'b', wave: 1, enemyId: enemy.id, t: 0, powerUpType: 'shield' };

  sync.handlers.onEvent('e1', claim);
  sync.handlers.onEvent('e2', claim);

  assert.equal(game.score, C.SCORE_PER_ENEMY);
  assert.equal(game.powerUps.length, 1);
  assert.equal(game.powerUps[0].type, 'shield');
});

test('mi propio potenciador no se duplica si el compañero reclama la misma baja con otro', () => {
  const { game, sync } = newGame();
  const enemy = game.formation.enemies[2];
  shootAt(game, enemy, 'a');
  assert.equal(game.powerUps.length, 1);

  sync.handlers.onEvent('e1', {
    type: 'kill', uid: 'b', wave: 1, enemyId: enemy.id, t: 0, powerUpType: 'overdrive',
  });
  assert.equal(game.powerUps.length, 1);
});

test('las bajas de la fase bonus también aplican el primer reclamo', () => {
  const { game, sync } = newGame();
  game.wave = 5;
  game.formation.enemies.forEach((enemy) => { enemy.dead = true; });
  game.update(0.001);
  assert.ok(game.bonusStage);
  game.bonusStage.ships.push({ id: 90, x: 100, y: 100, w: 24, h: 16, vx: 0, dead: false });

  const claim = { type: 'bonus-kill', uid: 'b', wave: 5, shipId: 90, multiplier: 1, t: 0 };
  const before = game.score;
  sync.handlers.onEvent('e1', claim);
  sync.handlers.onEvent('e2', claim);

  assert.equal(game.score, before + 50);
  assert.equal(game.bonusStage.ships.find((ship) => ship.id === 90).dead, true);
});
