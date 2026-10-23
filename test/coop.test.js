import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bullet } from '../src/game/Bullet.js';
import { Game } from '../src/game/Game.js';

class RecordingCoopSync {
  isCoop = true;
  uid = 'player-a';
  remoteUid = 'player-b';
  remoteX = 0.5;
  isHost = true;
  emitted = [];

  setHandlers(handlers) {
    this.handlers = handlers;
  }

  publishPlayerX(x) {
    this.lastX = x;
  }

  emitShot(...args) {
    this.emitted.push(['shot', ...args]);
  }

  emitKill(...args) {
    this.emitted.push(['kill', ...args]);
  }

  emitHit(...args) {
    this.emitted.push(['hit', ...args]);
  }

  emitRevive(...args) {
    this.emitted.push(['revive', ...args]);
  }

  emitLifeLoss(...args) {
    this.emitted.push(['life-loss', ...args]);
  }

  emitBonusKill(...args) {
    this.emitted.push(['bonus-kill', ...args]);
  }

  dispose() {}
}

const newCoopGame = () => {
  const sync = new RecordingCoopSync();
  const game = new Game({ sync, random: () => 0.5, hazardsRandom: () => 0.5 });
  return { game, sync };
};

test('los disparos de ambos jugadores colisionan y generan un estallido de daño en área', () => {
  const { game } = newCoopGame();
  const [target, other] = game.formation.enemies;
  target.x = 110;
  target.y = 220;
  target.hp = 4;
  game.bullets.push(
    new Bullet({
      x: target.x,
      y: target.y,
      fromPlayer: true,
      vy: 0,
      ownerUid: 'player-a',
    }),
    new Bullet({
      x: target.x,
      y: target.y,
      fromPlayer: true,
      vy: 0,
      ownerUid: 'player-b',
    }),
  );

  game.update(0.001);

  assert.equal(target.dead, true);
  assert.equal(other.dead, false);
  assert.equal(game.synergyEffects.length, 1);
  assert.ok(game.score >= 10);
});

test('la nave caída revive al contacto y consume una vida compartida; a cero no se rescata', () => {
  const { game, sync } = newCoopGame();
  game.remotePlayer.x = game.player.x;
  sync.remoteX = game.player.x / game.width;
  game.remotePlayer.downedTimer = 4;

  game.update(0.01);

  assert.equal(game.remotePlayer.downedTimer, 0);
  assert.equal(game.lives, 2);
  assert.deepEqual(sync.emitted.find(([type]) => type === 'revive'), [
    'revive',
    'player-b',
    game.elapsed,
  ]);

  game.lives = 0;
  game.remotePlayer.downedTimer = 4;
  game.remotePlayer.revivePending = false;
  game.update(0.01);
  assert.ok(Math.abs(game.remotePlayer.downedTimer - 3.99) < 0.001);
  assert.equal(sync.emitted.filter(([type]) => type === 'revive').length, 1);
});

test('en cooperativo el jugador cae durante cinco segundos antes de perderse una vida', () => {
  const { game, sync } = newCoopGame();

  assert.equal(game.player.hit(), true);
  assert.equal(game.player.downedTimer, 5);
  assert.equal(game.lives, 3);
  game.player.downedTimer = 0.01;
  game.update(0.02);

  assert.equal(game.player.eliminated, true);
  assert.equal(game.lives, 2);
  assert.deepEqual(sync.emitted.find(([type]) => type === 'life-loss'), [
    'life-loss',
    game.elapsed,
    true,
  ]);
});

test('los disparos remotos respetan su posición, propietario y daño sincronizados', () => {
  const { game, sync } = newCoopGame();
  sync.handlers.onEvent('event-1', {
    type: 'shot',
    uid: 'player-b',
    x: 0.25,
    vx: 40,
    damage: 2,
  });
  const bullet = game.bullets.at(-1);

  assert.equal(bullet.x, game.width * 0.25);
  assert.equal(bullet.ownerUid, 'player-b');
  assert.equal(bullet.damage, 2);
  assert.equal(bullet.vx, 40);
});
