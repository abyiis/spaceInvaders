import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/Game.js';
import { NoopSyncGateway } from '../src/game/SyncGateway.js';

class FakeCoopSync extends NoopSyncGateway {
  emitted = [];

  constructor(host) {
    super();
    this.host = host;
  }

  get isCoop() { return true; }

  get isHost() { return this.host; }

  get uid() { return this.host ? 'host' : 'guest'; }

  get remoteUid() { return this.host ? 'guest' : 'host'; }

  setHandlers(handlers) { this.handlers = handlers; }

  emitHit(...args) { this.emitted.push(['hit', ...args]); }

  emitRevive(...args) { this.emitted.push(['revive', ...args]); }

  emitLifeLoss(...args) { this.emitted.push(['life-loss', ...args]); }

  emitState(...args) { this.emitted.push(['state', ...args]); }
}

const newGame = (host) => {
  const sync = new FakeCoopSync(host);
  const game = new Game({ sync, random: () => 0.5 });
  return { game, sync };
};

const states = (sync) => sync.emitted.filter(([type]) => type === 'state');

test('el host publica las vidas oficiales cuando rescata a su compañero', () => {
  const { game, sync } = newGame(true);
  game.remotePlayer.downedTimer = 4;
  game.remotePlayer.x = game.player.x;
  game.update(0.01);

  assert.equal(game.lives, 2);
  assert.equal(states(sync).length, 1);
  assert.deepEqual(states(sync)[0].slice(2), [game.score, 2, 1]);
});

test('el host publica las vidas oficiales cuando su nave se elimina', () => {
  const { game, sync } = newGame(true);
  game.player.hit();
  game.player.downedTimer = 0.01;
  game.update(0.02);

  assert.equal(game.lives, 2);
  assert.equal(states(sync).length, 1);
  assert.equal(states(sync)[0][3], 2);
});

test('el host publica las vidas tras aplicar el rescate o la eliminación del compañero', () => {
  const { game, sync } = newGame(true);
  sync.handlers.onEvent('e1', { type: 'revive', uid: 'guest', targetUid: 'someone', t: 1 });
  assert.equal(game.lives, 2);
  sync.handlers.onEvent('e2', { type: 'life-loss', uid: 'guest', t: 2, consumedLife: true });
  assert.equal(game.lives, 1);
  assert.deepEqual(states(sync).map((entry) => entry[3]), [2, 1]);
});

test('el invitado nunca publica el estado oficial y adopta las vidas del host', () => {
  const { game, sync } = newGame(false);
  game.remotePlayer.downedTimer = 4;
  game.remotePlayer.x = game.player.x;
  game.update(0.01);
  assert.equal(game.lives, 2);
  assert.equal(states(sync).length, 0);

  sync.handlers.onEvent('e1', { type: 'state', uid: 'host', t: 1, score: 40, lives: 1, wave: 1 });
  assert.equal(game.lives, 1);
  assert.equal(game.score, 0);
});

test('el host ignora un evento state ajeno y las vidas nunca bajan de cero ni son fraccionarias', () => {
  const host = newGame(true);
  host.sync.handlers.onEvent('e1', { type: 'state', uid: 'guest', t: 1, score: 9999, lives: 3, wave: 9 });
  assert.equal(host.game.lives, 3);

  const guest = newGame(false);
  guest.sync.handlers.onEvent('e1', { type: 'state', uid: 'host', t: 1, lives: -4 });
  assert.equal(guest.game.lives, 0);
  guest.sync.handlers.onEvent('e2', { type: 'state', uid: 'host', t: 1, lives: 2.9 });
  assert.equal(guest.game.lives, 2);
  guest.sync.handlers.onEvent('e3', { type: 'state', uid: 'host', t: 1, lives: 'x' });
  assert.equal(guest.game.lives, 2);
});

test('el invitado ignora un state que no firma el host actual', () => {
  const { game, sync } = newGame(false);
  Object.defineProperty(sync, 'hostUid', { get: () => 'host' });
  sync.handlers.onEvent('e1', { type: 'state', uid: 'impostor', t: 1, lives: 0 });
  assert.equal(game.lives, 3);
  sync.handlers.onEvent('e2', { type: 'state', uid: 'host', t: 1, lives: 1 });
  assert.equal(game.lives, 1);
});

test('un impacto en la invulnerabilidad posterior al rescate no tumba la nave', () => {
  const { game, sync } = newGame(false);
  assert.equal(game.player.revive(), true);
  assert.equal(game.player.hit(), false);
  assert.equal(game.player.downedTimer, 0);
  assert.equal(sync.emitted.filter(([type]) => type === 'hit').length, 0);
});
