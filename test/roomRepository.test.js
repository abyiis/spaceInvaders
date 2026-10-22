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
  const databaseApi = {
    get: async (databaseRef) => {
      const value = snapshots.get(databaseRef.path);
      return {
        exists: () => value !== undefined,
        val: () => value ?? null,
      };
    },
    ref: (_database, path) => ({ path }),
    serverTimestamp: () => timestamp,
    runTransaction: async (roomRef, update, options) => {
      const value = update(null);
      transactionCalls.push({ roomRef, value, options });
      return { committed, snapshot: { val: () => value } };
    },
  };
  const rtdb = {};
  return { authService, databaseApi, rtdb, snapshots, timestamp, transactionCalls };
}

test('createRoom authenticates and transactionally creates room metadata', async () => {
  const dependencies = createDependencies();
  const repository = createRoomRepository({
    ...dependencies,
    codeFactory: () => 'K7QX2',
    seedFactory: () => 12345,
  });

  assert.deepEqual(await repository.createRoom(), { code: 'K7QX2', seed: 12345 });
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
  ]);
});

test('createRoom retries when a generated room code is already taken', async () => {
  const dependencies = createDependencies();
  let attempt = 0;
  dependencies.databaseApi.runTransaction = async (roomRef, update) => {
    attempt += 1;
    if (attempt === 1) {
      assert.equal(update({ hostUid: 'another-host' }), undefined);
      return { committed: false };
    }
    update(null);
    return { committed: true };
  };
  const repository = createRoomRepository({
    ...dependencies,
    codeFactory: () => (attempt === 0 ? 'AAAAA' : 'BBBBB'),
    seedFactory: () => 7,
  });

  assert.deepEqual(await repository.createRoom(), { code: 'BBBBB', seed: 7 });
  assert.equal(attempt, 2);
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

  const joined = await repository.joinRoom(' k7qx2 ');

  assert.equal(joined.code, 'K7QX2');
  assert.equal(joined.meta.hostUid, 'host-user');
  assert.deepEqual(joined.player, {
    name: 'Jugador',
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
