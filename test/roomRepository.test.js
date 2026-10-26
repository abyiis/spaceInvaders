import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRoomRepository } from '../src/net/roomRepository.js';

function createDependencies({ committed = true } = {}) {
  const authService = {
    signIn: async () => 'host-user',
  };
  const transactionCalls = [];
  const snapshots = new Map();
  const timestamp = { '.sv': 'timestamp' };
  const updates = [];
  const writes = [];
  const disconnectCalls = [];
  const removals = [];
  const subscriptions = new Map();
  let childAddedCallback;
  let valueCallback;
  let errorCallback;
  const databaseApi = {
    get: async (databaseRef) => {
      const value = snapshots.get(databaseRef.path);
      return {
        exists: () => value !== undefined,
        val: () => value ?? null,
      };
    },
    onChildAdded: (databaseRef, callback, onError) => {
      childAddedCallback = callback;
      subscriptions.set(databaseRef.path, { onChildAdded: callback, onError });
      return () => {
        subscriptions.delete(databaseRef.path);
        childAddedCallback = undefined;
      };
    },
    onDisconnect: (databaseRef) => ({
      update: async (data) => {
        disconnectCalls.push({ action: 'update', databaseRef, data });
      },
      cancel: async () => {
        disconnectCalls.push({ action: 'cancel', databaseRef });
      },
    }),
    onValue: (databaseRef, onValue, onError) => {
      valueCallback = onValue;
      errorCallback = onError;
      subscriptions.set(databaseRef.path, { onValue, onError });
      return () => {
        subscriptions.delete(databaseRef.path);
        valueCallback = undefined;
        errorCallback = undefined;
      };
    },
    push: (databaseRef) => ({ path: `${databaseRef.path}/event-1`, key: 'event-1' }),
    remove: async (databaseRef) => {
      removals.push(databaseRef.path);
    },
    ref: (_database, path) => ({ path }),
    serverTimestamp: () => timestamp,
    set: async (databaseRef, data) => {
      writes.push({ databaseRef, data });
    },
    runTransaction: async (roomRef, update, options) => {
      const value = update(null);
      transactionCalls.push({ roomRef, value, options });
      return { committed, snapshot: { val: () => value } };
    },
    update: async (databaseRef, data) => {
      updates.push({ databaseRef, data });
    },
  };
  const rtdb = {};
  return {
    authService,
    databaseApi,
    disconnectCalls,
    removals,
    get errorCallback() {
      return errorCallback;
    },
    get valueCallback() {
      return valueCallback;
    },
    rtdb,
    snapshots,
    subscriptions,
    timestamp,
    transactionCalls,
    updates,
    writes,
    get childAddedCallback() {
      return childAddedCallback;
    },
  };
}

test('createRoom authenticates and creates room metadata and the host player', async () => {
  const dependencies = createDependencies();
  const repository = createRoomRepository({
    ...dependencies,
    codeFactory: () => 'K7QX2',
    seedFactory: () => 12345,
  });

  const created = await repository.createRoom({ name: 'Ace' });
  assert.deepEqual(created, {
    code: 'K7QX2',
    seed: 12345,
    uid: 'host-user',
    player: {
      name: 'Ace',
      x: 0,
      ts: dependencies.timestamp,
      ready: false,
      connected: true,
    },
  });
  assert.deepEqual(dependencies.transactionCalls, [
    {
      roomRef: { path: 'rooms/K7QX2/meta' },
      value: {
        hostUid: 'host-user',
        seed: 12345,
        status: 'lobby',
        createdAt: dependencies.timestamp,
        maxPlayers: 2,
      },
      options: { applyLocally: false },
    },
    {
      roomRef: { path: 'rooms/K7QX2/players/host-user' },
      value: created.player,
      options: { applyLocally: false },
    },
  ]);
});

test('createRoom retries when a generated room code is already taken', async () => {
  const dependencies = createDependencies();
  let metaAttempts = 0;
  dependencies.databaseApi.runTransaction = async (roomRef, update) => {
    if (roomRef.path.endsWith('/meta')) {
      metaAttempts += 1;
    }
    if (metaAttempts === 1) {
      assert.equal(update({ hostUid: 'another-host' }), undefined);
      return { committed: false };
    }
    update(null);
    return { committed: true };
  };
  const repository = createRoomRepository({
    ...dependencies,
    codeFactory: () => (metaAttempts === 0 ? 'AAAAA' : 'BBBBB'),
    seedFactory: () => 7,
  });

  assert.deepEqual(await repository.createRoom(), {
    code: 'BBBBB',
    seed: 7,
    uid: 'host-user',
    player: {
      name: 'Jugador',
      x: 0,
      ts: dependencies.timestamp,
      ready: false,
      connected: true,
    },
  });
  assert.equal(metaAttempts, 2);
});

test('createRoom stops after the maximum number of occupied codes', async () => {
  const dependencies = createDependencies({ committed: false });
  const repository = createRoomRepository({
    ...dependencies,
    codeFactory: () => 'AAAAA',
    seedFactory: () => 7,
  });

  await assert.rejects(repository.createRoom(), /after several code generation attempts/);
  assert.equal(dependencies.transactionCalls.length, 5);
});

test('createRoom propagates authentication failures without writing', async () => {
  const dependencies = createDependencies();
  const failure = new Error('Authentication is not enabled.');
  dependencies.authService.signIn = async () => {
    throw failure;
  };
  const repository = createRoomRepository({
    ...dependencies,
    codeFactory: () => 'AAAAA',
    seedFactory: () => 7,
  });

  await assert.rejects(repository.createRoom(), (error) => error === failure);
  assert.equal(dependencies.transactionCalls.length, 0);
});

test('createRoom rejects invalid room codes and missing authenticated uid', async () => {
  const dependencies = createDependencies();
  const invalidCodeRepository = createRoomRepository({
    ...dependencies,
    codeFactory: () => 'bad!',
    seedFactory: () => 7,
  });
  await assert.rejects(invalidCodeRepository.createRoom(), /invalid code/);

  dependencies.authService.signIn = async () => null;
  const unauthenticatedRepository = createRoomRepository({
    ...dependencies,
    codeFactory: () => 'AAAAA',
    seedFactory: () => 7,
  });
  await assert.rejects(
    unauthenticatedRepository.createRoom(),
    /without an authenticated user/,
  );
});

test('room creation and joining reject aliases outside the supported length', async () => {
  const dependencies = createDependencies();
  const repository = createRoomRepository(dependencies);

  await assert.rejects(repository.createRoom({ name: '   ' }), /Player name must contain/);
  await assert.rejects(
    repository.joinRoom('AAAAA', { name: 'This alias is too long' }),
    /Player name must contain/,
  );
});

test('joinRoom validates the room, reserves the player node and normalizes its code', async () => {
  const dependencies = createDependencies();
  dependencies.snapshots.set('rooms/K7QX2/meta', {
    hostUid: 'host-user',
    seed: 123,
    status: 'lobby',
    maxPlayers: 2,
  });
  dependencies.snapshots.set('rooms/K7QX2/players', {
    'host-user': { name: 'Host', connected: true },
  });
  const repository = createRoomRepository({
    ...dependencies,
    seedFactory: () => 7,
  });

  const joined = await repository.joinRoom(' k7qx2 ', { name: 'Pilot' });

  assert.equal(joined.code, 'K7QX2');
  assert.equal(joined.meta.hostUid, 'host-user');
  assert.deepEqual(joined.player, {
    name: 'Pilot',
    x: 0,
    ts: dependencies.timestamp,
    ready: false,
    connected: true,
  });
  assert.deepEqual(dependencies.transactionCalls[0], {
    roomRef: { path: 'rooms/K7QX2/players/host-user' },
    value: joined.player,
    options: { applyLocally: false },
  });
});

test('joinRoom rejects malformed codes, missing rooms, non-lobby rooms and full rooms', async () => {
  const dependencies = createDependencies();
  const repository = createRoomRepository(dependencies);
  await assert.rejects(repository.joinRoom('bad'), /exactly five valid characters/);

  await assert.rejects(repository.joinRoom('AAAAA'), /does not exist/);

  dependencies.snapshots.set('rooms/AAAAA/meta', { status: 'playing', maxPlayers: 2 });
  dependencies.snapshots.set('rooms/AAAAA/players', {});
  await assert.rejects(repository.joinRoom('AAAAA'), /not accepting players/);

  dependencies.snapshots.set('rooms/AAAAA/meta', { status: 'lobby', maxPlayers: 2 });
  dependencies.snapshots.set('rooms/AAAAA/players', {
    host: { connected: true },
    guest: { connected: true },
  });
  await assert.rejects(repository.joinRoom('AAAAA'), /Room is full/);
});

test('joinRoom allows the same uid to re-enter an existing room', async () => {
  const dependencies = createDependencies({ committed: false });
  const priorPlayer = { name: 'Existing', ready: true, connected: false };
  dependencies.snapshots.set('rooms/AAAAA/meta', { status: 'lobby', maxPlayers: 1 });
  dependencies.snapshots.set('rooms/AAAAA/players', { 'host-user': priorPlayer });
  dependencies.databaseApi.runTransaction = async (playerRef, update) => {
    assert.equal(update(priorPlayer), undefined);
    return { committed: false, snapshot: { val: () => priorPlayer } };
  };
  const repository = createRoomRepository(dependencies);

  const result = await repository.joinRoom('AAAAA');

  assert.deepEqual(result.player, priorPlayer);
});

test('joinRoom propagates database errors and rejects failed slot reservations', async () => {
  const dependencies = createDependencies();
  dependencies.snapshots.set('rooms/AAAAA/meta', { status: 'lobby', maxPlayers: 2 });
  dependencies.snapshots.set('rooms/AAAAA/players', {});
  const failure = new Error('Permission denied');
  dependencies.databaseApi.runTransaction = async () => {
    throw failure;
  };
  const repository = createRoomRepository(dependencies);
  await assert.rejects(repository.joinRoom('AAAAA'), (error) => error === failure);

  dependencies.databaseApi.runTransaction = async () => ({
    committed: false,
    snapshot: { val: () => null },
  });
  await assert.rejects(repository.joinRoom('AAAAA'), /reserve a player slot/);
});

test('watchPlayers subscribes only to the room player node and returns its cancellation', () => {
  const dependencies = createDependencies();
  const repository = createRoomRepository(dependencies);
  const received = [];
  const onError = () => {};
  const unsubscribe = repository.watchPlayers(
    ' aaaaa ',
    (players) => received.push(players),
    onError,
  );

  assert.equal(typeof unsubscribe, 'function');
  assert.equal(typeof dependencies.valueCallback, 'function');
  assert.equal(dependencies.errorCallback, onError);
  dependencies.valueCallback({ val: () => ({ player: { name: 'Test' } }) });
  assert.deepEqual(received, [{ player: { name: 'Test' } }]);
  unsubscribe();
  assert.equal(dependencies.valueCallback, undefined);
  assert.throws(
    () => repository.watchPlayers('AAAAA', () => {}),
    /callbacks must be functions/,
  );
});

test('setReady writes only the authenticated player ready field', async () => {
  const dependencies = createDependencies();
  const repository = createRoomRepository(dependencies);

  await repository.setReady(' aaaaa ', true);

  assert.deepEqual(dependencies.updates, [
    {
      databaseRef: { path: 'rooms/AAAAA/players/host-user' },
      data: { ready: true },
    },
  ]);
  await assert.rejects(repository.setReady('AAAAA', 'yes'), /must be a boolean/);
});

test('startGame exige que el host tenga dos jugadores conectados y listos', async () => {
  const dependencies = createDependencies();
  const meta = {
    hostUid: 'host-user',
    seed: 17,
    status: 'lobby',
    createdAt: dependencies.timestamp,
  };
  dependencies.snapshots.set('rooms/AAAAA/meta', meta);
  dependencies.snapshots.set('rooms/AAAAA/players', {
    host: { ready: true, connected: true },
    guest: { ready: true, connected: true },
  });
  dependencies.databaseApi.runTransaction = async (_ref, update, options) => {
    const value = update(meta);
    dependencies.transactionCalls.push({ value, options });
    return { committed: true, snapshot: { val: () => value } };
  };
  dependencies.snapshots.set('.info/serverTimeOffset', 250);
  const repository = createRoomRepository({ ...dependencies, localNow: () => 1_000_000 });

  assert.deepEqual(await repository.startGame('aaaaa'), {
    code: 'AAAAA',
    seed: 17,
    hostUid: 'host-user',
    startAt: 1_003_250,
  });
  assert.deepEqual(dependencies.transactionCalls[0].value, {
    ...meta,
    status: 'playing',
    startAt: 1_003_250,
  });

  dependencies.snapshots.set('rooms/AAAAA/players', {
    host: { ready: true, connected: true },
    guest: { ready: false, connected: true },
  });
  await assert.rejects(repository.startGame('AAAAA'), /Both players must be connected and ready/);
});

test('watchRoomStatus y watchGameEvents validan datos, entregan eventos y se cancelan', () => {
  const dependencies = createDependencies();
  const repository = createRoomRepository(dependencies);
  const statuses = [];
  const stopStatus = repository.watchRoomStatus(
    'aaaaa',
    (meta) => statuses.push(meta),
    () => {},
  );
  dependencies.valueCallback({ val: () => ({ status: 'playing' }) });
  assert.deepEqual(statuses, [{ status: 'playing' }]);
  stopStatus();

  const events = [];
  const stopEvents = repository.watchGameEvents(
    'AAAAA',
    (id, event) => events.push([id, event]),
    () => {},
  );
  dependencies.childAddedCallback({ key: 'event-1', val: () => ({ type: 'shot' }) });
  assert.deepEqual(events, [['event-1', { type: 'shot' }]]);
  stopEvents();
});

test('publishPlayerX y emitGameEvent escriben solo el jugador autenticado', async () => {
  const dependencies = createDependencies();
  const repository = createRoomRepository(dependencies);
  await repository.publishPlayerX('AAAAA', 0.4);
  await repository.emitGameEvent('AAAAA', { type: 'shot', x: 0.4, t: 2 });

  assert.deepEqual(dependencies.updates[0], {
    databaseRef: { path: 'rooms/AAAAA/players/host-user' },
    data: { x: 0.4, ts: dependencies.timestamp },
  });
  assert.deepEqual(dependencies.writes[0], {
    databaseRef: { path: 'rooms/AAAAA/events/event-1', key: 'event-1' },
    data: { type: 'shot', x: 0.4, t: 2, uid: 'host-user' },
  });
  await assert.rejects(repository.publishPlayerX('AAAAA', 1.1), /normalized/);
});

test('watchPresence registers disconnect state, marks connected, and clears presence on stop', async () => {
  const dependencies = createDependencies();
  const repository = createRoomRepository(dependencies);
  const errors = [];
  const stop = repository.watchPresence(' aaaaa ', 'host-user', (error) => errors.push(error));

  const connection = dependencies.subscriptions.get('.info/connected');
  assert.ok(connection);
  connection.onValue({ val: () => false });
  assert.equal(dependencies.disconnectCalls.length, 0);
  connection.onValue({ val: () => true });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(dependencies.disconnectCalls, [
    {
      action: 'update',
      databaseRef: { path: 'rooms/AAAAA/players/host-user' },
      data: { connected: false },
    },
  ]);
  assert.deepEqual(dependencies.updates[0], {
    databaseRef: { path: 'rooms/AAAAA/players/host-user' },
    data: { connected: true },
  });

  await stop();
  assert.deepEqual(dependencies.updates[1], {
    databaseRef: { path: 'rooms/AAAAA/players/host-user' },
    data: { connected: false },
  });
  assert.deepEqual(dependencies.disconnectCalls[1], {
    action: 'cancel',
    databaseRef: { path: 'rooms/AAAAA/players/host-user' },
  });
  assert.equal(dependencies.subscriptions.has('.info/connected'), false);
  assert.deepEqual(errors, []);
});

test('claimHost transfiere meta/hostUid solo desde el host anterior y avisa si no lo consigue', async () => {
  const dependencies = createDependencies();
  const seen = [];
  dependencies.databaseApi.runTransaction = async (databaseRef, update, options) => {
    seen.push({ path: databaseRef.path, options, current: update('old-host'), unknown: update(null), other: update('someone') });
    return { committed: true };
  };
  const repository = createRoomRepository(dependencies);

  assert.equal(await repository.claimHost('aaaaa', 'old-host'), true);
  assert.equal(seen[0].path, 'rooms/AAAAA/meta/hostUid');
  assert.equal(seen[0].current, 'host-user');
  assert.equal(seen[0].unknown, 'host-user');
  assert.equal(seen[0].other, undefined);
  assert.deepEqual(seen[0].options, { applyLocally: false });

  dependencies.databaseApi.runTransaction = async () => ({ committed: false });
  assert.equal(await repository.claimHost('AAAAA', 'old-host'), false);
  await assert.rejects(repository.claimHost('bad', 'old-host'), /five valid characters/);
  await assert.rejects(repository.claimHost('AAAAA', ''), /previous host uid/);
});

test('watchConnection traduce .info/connected a un booleano y se cancela', () => {
  const dependencies = createDependencies();
  const repository = createRoomRepository(dependencies);
  const states = [];
  const stop = repository.watchConnection((online) => states.push(online), () => {});

  assert.ok(dependencies.subscriptions.has('.info/connected'));
  dependencies.valueCallback({ val: () => true });
  dependencies.valueCallback({ val: () => false });
  dependencies.valueCallback({ val: () => null });
  assert.deepEqual(states, [true, false, false]);
  stop();
  assert.equal(dependencies.subscriptions.has('.info/connected'), false);
  assert.throws(() => repository.watchConnection(null, () => {}), TypeError);
});

test('watchServerOffset entrega el desfase del servidor y se cancela', () => {
  const dependencies = createDependencies();
  const repository = createRoomRepository(dependencies);
  const offsets = [];
  const stop = repository.watchServerOffset((offset) => offsets.push(offset), () => {});

  assert.ok(dependencies.subscriptions.has('.info/serverTimeOffset'));
  dependencies.valueCallback({ val: () => -420 });
  dependencies.valueCallback({ val: () => null });
  assert.deepEqual(offsets, [-420]);
  stop();
  assert.equal(dependencies.subscriptions.has('.info/serverTimeOffset'), false);
  assert.throws(() => repository.watchServerOffset(null, () => {}), TypeError);
});

test('finishRoom marca la sala como terminada solo si quien llama es el host', async () => {
  const dependencies = createDependencies();
  const calls = [];
  dependencies.databaseApi.runTransaction = async (databaseRef, update) => {
    calls.push({
      path: databaseRef.path,
      host: update({ hostUid: 'host-user', status: 'playing', seed: 1 }),
      other: update({ hostUid: 'someone', status: 'playing' }),
      empty: update(null),
    });
    return { committed: true };
  };
  const repository = createRoomRepository(dependencies);

  assert.equal(await repository.finishRoom('aaaaa'), true);
  assert.equal(calls[0].path, 'rooms/AAAAA/meta');
  assert.deepEqual(calls[0].host, { hostUid: 'host-user', status: 'finished', seed: 1 });
  assert.equal(calls[0].other, undefined);
  assert.equal(calls[0].empty, undefined);
  await assert.rejects(repository.finishRoom('x'), /five valid characters/);
});

test('deleteRoom borra rooms/{code} completa', async () => {
  const dependencies = createDependencies();
  const repository = createRoomRepository(dependencies);
  await repository.deleteRoom('abcde');
  assert.deepEqual(dependencies.removals, ['rooms/ABCDE']);
  await assert.rejects(repository.deleteRoom('abc'), /five valid characters/);
});

test('leaveLobby: el host cierra la sala y el invitado solo libera su plaza', async () => {
  const dependencies = createDependencies();
  const repository = createRoomRepository(dependencies);

  dependencies.snapshots.set('rooms/AAAAA/meta', { hostUid: 'host-user' });
  assert.equal(await repository.leaveLobby('AAAAA'), 'closed');
  assert.deepEqual(dependencies.removals, ['rooms/AAAAA']);

  dependencies.removals.length = 0;
  dependencies.snapshots.set('rooms/AAAAA/meta', { hostUid: 'another-host' });
  assert.equal(await repository.leaveLobby('AAAAA'), 'left');
  assert.deepEqual(dependencies.removals, ['rooms/AAAAA/players/host-user']);

  dependencies.removals.length = 0;
  dependencies.snapshots.delete('rooms/AAAAA/meta');
  assert.equal(await repository.leaveLobby('AAAAA'), 'left');
  assert.deepEqual(dependencies.removals, ['rooms/AAAAA/players/host-user']);
});
