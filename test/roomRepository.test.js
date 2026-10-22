import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRoomRepository } from '../src/net/roomRepository.js';

function createDependencies({ committed = true } = {}) {
  const authService = {
    signIn: async () => 'host-user',
  };
  const transactionCalls = [];
  const timestamp = { '.sv': 'timestamp' };
  const databaseApi = {
    ref: (_database, path) => ({ path }),
    serverTimestamp: () => timestamp,
    runTransaction: async (roomRef, update, options) => {
      const value = update(null);
      transactionCalls.push({ roomRef, value, options });
      return { committed, snapshot: { val: () => value } };
    },
  };
  const rtdb = {};
  return { authService, databaseApi, rtdb, timestamp, transactionCalls };
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
