import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CoopGateway } from '../src/game/CoopGateway.js';
import {
  autopilot,
  createClient,
  createFakeRoom,
  createVirtualTimers,
} from './helpers/fakeRoom.js';

const FRAME_MS = 1000 / 60;

function createGatewayHarness({ claimResult = true } = {}) {
  const clock = { now: 0 };
  const timers = createVirtualTimers(clock);
  const handlers = {};
  const claims = [];
  const repository = {
    watchPlayers: (_code, listener) => { handlers.players = listener; return () => {}; },
    watchGameEvents: () => () => {},
    watchRoomStatus: (_code, listener) => { handlers.meta = listener; return () => {}; },
    watchPresence: () => async () => {},
    claimHost: async (code, previous) => {
      claims.push([code, previous]);
      return claimResult;
    },
  };
  const hostChanges = [];
  const gateway = new CoopGateway({
    roomRepository: repository,
    code: 'ABCDE',
    uid: 'guest',
    hostUid: 'host',
    now: () => clock.now,
    setTimeoutFn: timers.setTimeout,
    clearTimeoutFn: timers.clearTimeout,
    takeoverGraceMs: 2000,
    onError: (error) => { throw error; },
  });
  gateway.setHandlers({ onHostChange: (uid) => hostChanges.push(uid) });
  const advance = async (ms) => {
    clock.now += ms;
    timers.tick();
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { gateway, handlers, claims, hostChanges, advance, timers };
}

test('el invitado releva al host tras 2 s de desconexión y avisa al juego', async () => {
  const { gateway, handlers, claims, hostChanges, advance } = createGatewayHarness();
  handlers.players({ host: { connected: true }, guest: { connected: true } });
  assert.equal(gateway.isHost, false);

  handlers.players({ host: { connected: false }, guest: { connected: true } });
  await advance(1500);
  assert.deepEqual(claims, []);
  await advance(600);
  assert.deepEqual(claims, [['ABCDE', 'host']]);
  assert.equal(gateway.isHost, true);
  assert.equal(gateway.hostUid, 'guest');
  assert.deepEqual(hostChanges, ['guest']);
});

test('si el host vuelve antes del margen, no hay relevo', async () => {
  const { gateway, handlers, claims, advance, timers } = createGatewayHarness();
  handlers.players({ host: { connected: false }, guest: { connected: true } });
  await advance(1500);
  handlers.players({ host: { connected: true }, guest: { connected: true } });
  assert.equal(timers.size, 0);
  await advance(3000);
  assert.deepEqual(claims, []);
  assert.equal(gateway.isHost, false);
});

test('si las reglas rechazan el relevo, sigue sin ser host', async () => {
  const { gateway, handlers, claims, hostChanges, advance } = createGatewayHarness({ claimResult: false });
  handlers.players({ host: { connected: false }, guest: { connected: true } });
  await advance(2500);
  assert.equal(claims.length, 1);
  assert.equal(gateway.isHost, false);
  assert.deepEqual(hostChanges, []);
});

test('si otro jugador ya relevó al host, el cambio llega por meta y no se reclama', async () => {
  const { gateway, handlers, claims, hostChanges, advance } = createGatewayHarness();
  handlers.players({ host: { connected: false }, guest: { connected: true } });
  await advance(1000);
  handlers.meta({ hostUid: 'amy', status: 'playing' });
  await advance(3000);
  assert.deepEqual(claims, []);
  assert.equal(gateway.hostUid, 'amy');
  assert.deepEqual(hostChanges, ['amy']);
});

test('dispose cancela el relevo pendiente', async () => {
  const { gateway, handlers, claims, advance, timers } = createGatewayHarness();
  handlers.players({ host: { connected: false }, guest: { connected: true } });
  assert.equal(timers.size, 1);
  gateway.dispose();
  assert.equal(timers.size, 0);
  await advance(5000);
  assert.deepEqual(claims, []);
});

test('integración: si el host se cae, el invitado asume el mando y la partida sigue avanzando', () => {
  const clock = { now: 1_000_000 };
  const timers = createVirtualTimers(clock);
  const room = createFakeRoom({ clock, latencyMs: 60 });
  room.setHost('host');
  const startAt = clock.now + 3000;
  const host = createClient({ room, clock, uid: 'host', hostUid: 'host', seed: 77, startAt, randomSeed: 1, timers });
  const guest = createClient({ room, clock, uid: 'guest', hostUid: 'host', seed: 77, startAt, randomSeed: 2, timers });

  const frame = (clients) => {
    clock.now += FRAME_MS;
    room.deliver();
    timers.tick();
    for (const client of clients) {
      autopilot(client);
      client.game.update(1 / 60);
    }
  };

  for (let i = 0; i < 60 * 20; i += 1) frame([host, guest]);
  assert.equal(guest.game.isAuthority, false);
  const waveBefore = guest.game.wave;

  // El host pierde la conexión: ya no actualiza ni publica, y su presencia pasa a desconectado.
  room.setConnected('host', false);
  for (let i = 0; i < 60 * 3; i += 1) frame([guest]);
  assert.equal(guest.gateway.isHost, true);
  assert.equal(guest.game.isAuthority, true);
  assert.ok(guest.game.notice === null || guest.game.notice.text.includes('host'));

  for (let i = 0; i < 60 * 60 && guest.game.wave === waveBefore; i += 1) frame([guest]);
  assert.ok(guest.game.wave > waveBefore || guest.game.boss, 'el nuevo host no hace avanzar la partida');
  assert.ok(room.sentEvents.some((event) => event.type === 'phase' && event.uid === 'guest'));
});
