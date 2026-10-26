import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C } from '../src/core/constants.js';
import { Game } from '../src/game/Game.js';
import { NoopSyncGateway } from '../src/game/SyncGateway.js';

class FakeCoopSync extends NoopSyncGateway {
  emitted = [];

  get isCoop() { return true; }

  get uid() { return 'a'; }

  get remoteUid() { return 'b'; }

  setHandlers(handlers) { this.handlers = handlers; }

  emitShot(...args) { this.emitted.push(['shot', ...args]); }
}

const newGame = () => {
  const sync = new FakeCoopSync();
  const game = new Game({ sync, random: () => 0.5 });
  game.player.fireCooldown = 1e9;
  return { game, sync };
};

const remoteBullets = (game) => game.bullets.filter((bullet) => bullet.ownerUid === 'b');

test('el disparo del compañero aparece en su nave con su propietario, daño y velocidad', () => {
  const { game, sync } = newGame();
  sync.handlers.onEvent('e1', { type: 'shot', uid: 'b', t: 0, x: 0.25, vx: 0, damage: 2 });
  const [bullet] = remoteBullets(game);

  assert.equal(bullet.x, game.width * 0.25);
  assert.equal(bullet.vy, -C.PLAYER_BULLET_SPEED);
  assert.equal(bullet.damage, 2);
  assert.equal(bullet.y, game.remotePlayer.y - game.player.h / 2);
});

test('el disparo lateral del triple disparo conserva la velocidad vertical reducida', () => {
  const { game, sync } = newGame();
  sync.handlers.onEvent('e1', { type: 'shot', uid: 'b', t: 0, x: 0.5, vx: 90, damage: 1 });
  const [bullet] = remoteBullets(game);
  assert.equal(bullet.vx, 90);
  assert.equal(bullet.vy, -C.PLAYER_BULLET_SPEED * C.SIDE_SHOT_SPEED_FACTOR);
});

test('un disparo que llega con retraso nace adelantado lo que habría avanzado', () => {
  const { game, sync } = newGame();
  game.elapsed = 5.1;
  sync.handlers.onEvent('e1', { type: 'shot', uid: 'b', t: 5.0, x: 0.5 });
  const [bullet] = remoteBullets(game);
  const origin = game.remotePlayer.y - game.player.h / 2;
  assert.ok(Math.abs(bullet.y - (origin - C.PLAYER_BULLET_SPEED * 0.1)) < 1e-9);
});

test('la compensación de latencia tiene tope y no adelanta eventos del futuro', () => {
  const { game, sync } = newGame();
  game.elapsed = 100;
  sync.handlers.onEvent('e1', { type: 'shot', uid: 'b', t: 1, x: 0.5 });
  sync.handlers.onEvent('e2', { type: 'shot', uid: 'b', t: 200, x: 0.5 });
  const [capped, future] = remoteBullets(game);
  const origin = game.remotePlayer.y - game.player.h / 2;
  assert.ok(Math.abs(capped.y - (origin - C.PLAYER_BULLET_SPEED * 0.25)) < 1e-9);
  assert.equal(future.y, origin);
});

test('aplicar un disparo remoto no genera eventos de vuelta', () => {
  const { game, sync } = newGame();
  sync.handlers.onEvent('e1', { type: 'shot', uid: 'b', t: 0, x: 0.5 });
  assert.deepEqual(sync.emitted, []);
  assert.equal(game.bullets.filter((bullet) => bullet.fromPlayer).length, 1);
});

test('el disparo propio se notifica al compañero con tiempo, posición, daño y vx', () => {
  const { game, sync } = newGame();
  game.player.fireCooldown = 0;
  game.player.tripleShot = 5;
  game.update(0.001);
  const shots = sync.emitted.filter(([type]) => type === 'shot');
  assert.equal(shots.length, 3);
  assert.deepEqual(shots.map(([, , , , vx]) => vx).sort((a, b) => a - b), [-90, 0, 90]);
  for (const [, t, x, damage] of shots) {
    assert.ok(Math.abs(t - game.elapsed) < 1e-9);
    assert.ok(x >= 0 && x <= 1);
    assert.equal(damage, 1);
  }
});
