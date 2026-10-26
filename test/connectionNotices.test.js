import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/Game.js';
import { CoopGateway } from '../src/game/CoopGateway.js';
import { NoopSyncGateway } from '../src/game/SyncGateway.js';
import { createClient, createFakeRoom } from './helpers/fakeRoom.js';

class FakeCoopSync extends NoopSyncGateway {
  status = { kind: 'ok', message: '' };

  constructor(host = true) {
    super();
    this.host = host;
  }

  get isCoop() { return true; }

  get isHost() { return this.host; }

  get uid() { return 'a'; }

  get remoteUid() { return 'b'; }

  get connectionStatus() { return this.status; }

  emitGameOver() {}
}

const newGame = (host) => {
  const sync = new FakeCoopSync(host);
  const game = new Game({ sync, random: () => 0.5 });
  game.player.invulnerable = 1e9;
  game.player.fireCooldown = 1e9;
  return { game, sync };
};

test('el aviso de conexión inestable se refleja en el juego y desaparece al normalizarse', () => {
  const { game, sync } = newGame(true);
  sync.status = { kind: 'unstable', message: 'Conexión inestable' };
  game.update(0.01);
  assert.equal(game.connection.message, 'Conexión inestable');
  sync.status = { kind: 'ok', message: '' };
  game.update(0.01);
  assert.equal(game.connection, null);
});

test('compañero desconectado: se avisa pero su nave sigue activa hasta los 10 s', () => {
  const { game, sync } = newGame(true);
  sync.status = { kind: 'peer-offline', secondsLeft: 7, message: 'Compañero desconectado · se retira en 7 s' };
  game.update(0.01);
  assert.equal(game.connection.kind, 'peer-offline');
  assert.equal(game.remotePlayer.eliminated, false);
});

test('pasados 10 s su nave se desactiva y el jugador que queda sigue en la partida', () => {
  const { game, sync } = newGame(true);
  sync.status = { kind: 'peer-gone', message: 'Tu compañero salió de la partida' };
  game.update(0.01);
  assert.equal(game.remotePlayer.eliminated, true);
  assert.equal(game.isGameOver, false);
  game.update(0.01);
  assert.equal(game.isGameOver, false);
});

test('con el compañero fuera, perder la propia nave termina la partida', () => {
  const { game, sync } = newGame(true);
  sync.status = { kind: 'peer-gone', message: 'Tu compañero salió de la partida' };
  game.update(0.01);
  game.player.invulnerable = 0;
  game.player.hit();
  game.player.downedTimer = 0.01;
  game.update(0.02);
  assert.equal(game.isGameOver, true);
});

test('un compañero fuera no puede ser rescatado ni cuenta para el rescate', () => {
  const { game, sync } = newGame(true);
  sync.status = { kind: 'peer-gone', message: 'x' };
  game.update(0.01);
  game.remotePlayer.downedTimer = 4;
  game.remotePlayer.x = game.player.x;
  game.update(0.01);
  assert.equal(game.lives, 3);
});

test('dibujar los avisos no falla (cuenta atrás, conexión y mensaje temporal)', () => {
  const { game, sync } = newGame(true);
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_target, property) => (...args) => { calls.push([property, ...args]); return { addColorStop() {} }; },
    set: () => true,
  });
  sync.status = { kind: 'peer-offline', secondsLeft: 4, message: 'Compañero desconectado · se retira en 4 s' };
  game.update(0.01);
  game.showNotice('Ahora eres el host de la partida', 3);
  game.countdown = 2.4;
  game.render(ctx);
  assert.ok(calls.some(([name, text]) => name === 'fillText' && text === 'Ahora eres el host de la partida'));
  assert.ok(calls.some(([name, text]) => name === 'fillText' && String(text).startsWith('Compañero desconectado')));
  assert.ok(calls.some(([name, text]) => name === 'fillText' && text === '3'));
});

test('el mensaje temporal caduca', () => {
  const { game } = newGame(true);
  game.showNotice('hola', 0.05);
  game.update(0.04);
  assert.ok(game.notice);
  game.update(0.02);
  assert.equal(game.notice, null);
});

test('CoopGateway: la presencia y el silencio del compañero alimentan el estado de conexión', () => {
  let time = 0;
  const handlers = {};
  const repository = {
    watchPlayers: (_code, listener) => { handlers.players = listener; return () => {}; },
    watchGameEvents: () => () => {},
    watchPresence: () => async () => {},
    watchConnection: (listener) => { handlers.connection = listener; return () => {}; },
  };
  const gateway = new CoopGateway({
    roomRepository: repository, code: 'ABCDE', uid: 'a', hostUid: 'a', now: () => time,
  });
  handlers.players({ a: { connected: true }, b: { connected: true, ts: 1 } });
  assert.equal(gateway.connectionStatus.kind, 'ok');

  time = 6000;
  assert.equal(gateway.connectionStatus.kind, 'unstable');
  handlers.players({ a: { connected: true }, b: { connected: true, ts: 2 } });
  assert.equal(gateway.connectionStatus.kind, 'ok');

  handlers.connection(false);
  assert.equal(gateway.connectionStatus.kind, 'unstable');
  handlers.connection(true);
  assert.equal(gateway.connectionStatus.kind, 'ok');

  handlers.players({ a: { connected: true }, b: { connected: false, ts: 2 } });
  assert.equal(gateway.connectionStatus.kind, 'peer-offline');
  time += 10_500;
  assert.equal(gateway.connectionStatus.kind, 'peer-gone');
  gateway.dispose();
});

test('integración: si el compañero se desconecta, el otro cliente lo da por fuera a los 10 s', () => {
  const clock = { now: 1_000_000 };
  const room = createFakeRoom({ clock, latencyMs: 60 });
  room.setHost('host');
  const startAt = clock.now + 3000;
  const host = createClient({ room, clock, uid: 'host', hostUid: 'host', seed: 5, startAt, randomSeed: 1 });
  for (let i = 0; i < 60 * 5; i += 1) {
    clock.now += 1000 / 60;
    room.deliver();
    host.game.update(1 / 60);
  }
  assert.equal(host.game.connection, null);
  const guestId = 'guest';
  room.repositoryFor(guestId).watchPresence();
  room.setConnected(guestId, false);
  for (let i = 0; i < 60 * 5; i += 1) {
    clock.now += 1000 / 60;
    room.deliver();
    host.game.update(1 / 60);
  }
  assert.equal(host.game.connection?.kind, 'peer-offline');
  for (let i = 0; i < 60 * 7; i += 1) {
    clock.now += 1000 / 60;
    room.deliver();
    host.game.update(1 / 60);
  }
  assert.equal(host.game.connection?.kind, 'peer-gone');
  assert.equal(host.game.remotePlayer.eliminated, true);
});
