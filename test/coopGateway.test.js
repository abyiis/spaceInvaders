import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CoopGateway } from '../src/game/CoopGateway.js';

function createRoomRepository() {
  const calls = [];
  let playersCallback;
  let eventsCallback;
  let disposedPlayers = false;
  let disposedEvents = false;
  let disposedPresence = false;
  return {
    calls,
    get disposed() {
      return { disposedPlayers, disposedEvents, disposedPresence };
    },
    watchPlayers(_code, callback) {
      playersCallback = callback;
      return () => { disposedPlayers = true; };
    },
    watchGameEvents(_code, callback) {
      eventsCallback = callback;
      return () => { disposedEvents = true; };
    },
    watchPresence() {
      return async () => { disposedPresence = true; };
    },
    publishPlayerX: async (...args) => calls.push(['position', ...args]),
    emitGameEvent: async (...args) => calls.push(['event', ...args]),
    updatePlayers(players) {
      playersCallback(players);
    },
    addEvent(id, event) {
      eventsCallback(id, event);
    },
  };
}

test('CoopGateway publica posición y eventos; filtra eventos propios y limpia suscripciones', async () => {
  const repository = createRoomRepository();
  const gateway = new CoopGateway({
    roomRepository: repository,
    code: 'ABCDE',
    uid: 'player-a',
    hostUid: 'player-a',
    onError: (error) => { throw error; },
  });
  const received = [];
  gateway.setHandlers({ onEvent: (...args) => received.push(args) });
  repository.updatePlayers({
    'player-a': { x: 0.3 },
    'player-b': { x: 0.7 },
  });
  assert.equal(gateway.isHost, true);
  assert.equal(gateway.remoteUid, 'player-b');
  assert.equal(gateway.remoteX, 0.7);

  gateway.publishPlayerX(0.3);
  gateway.emitShot(1, 0.3, 2, 0);
  repository.addEvent('own-event', { uid: 'player-a', type: 'shot' });
  repository.addEvent('peer-event', { uid: 'player-b', type: 'shot' });
  await Promise.resolve();

  assert.equal(repository.calls.filter(([kind]) => kind === 'position').length, 1);
  assert.deepEqual(repository.calls.find(([kind]) => kind === 'event'), [
    'event',
    'ABCDE',
    { type: 'shot', t: 1, x: 0.3, damage: 2, vx: 0 },
  ]);
  assert.deepEqual(received, [['peer-event', { uid: 'player-b', type: 'shot' }]]);

  gateway.dispose();
  await Promise.resolve();
  assert.deepEqual(repository.disposed, {
    disposedPlayers: true,
    disposedEvents: true,
    disposedPresence: true,
  });
});

test('CoopGateway conserva eventos recibidos antes de registrar el receptor', () => {
  const repository = createRoomRepository();
  const gateway = new CoopGateway({
    roomRepository: repository,
    code: 'ABCDE',
    uid: 'player-a',
    hostUid: 'player-b',
  });
  repository.addEvent('peer-event', { uid: 'player-b', type: 'hit' });
  const received = [];
  gateway.setHandlers({ onEvent: (...args) => received.push(args) });
  assert.deepEqual(received, [['peer-event', { uid: 'player-b', type: 'hit' }]]);
  gateway.dispose();
});
