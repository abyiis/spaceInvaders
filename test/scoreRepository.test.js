import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createScoreRepository } from '../src/net/scoreRepository.js';

function createDependencies() {
  const db = {};
  const writes = [];
  const timestamp = { serverTimestamp: true };
  const authService = {
    signIn: async () => 'player-uid',
  };
  const firestoreApi = {
    addDoc: async (collectionRef, document) => {
      writes.push({ collectionRef, document });
      return { id: 'score-entry-id' };
    },
    collection: (_database, name) => ({ name }),
    serverTimestamp: () => timestamp,
  };
  return { authService, db, firestoreApi, timestamp, writes };
}

test('saveSoloScore writes an authenticated solo leaderboard entry', async () => {
  const dependencies = createDependencies();
  const repository = createScoreRepository(dependencies);

  assert.equal(
    await repository.saveSoloScore({ score: 120, wave: 4, name: '  Piloto  ' }),
    'score-entry-id',
  );
  assert.deepEqual(dependencies.writes, [
    {
      collectionRef: { name: 'leaderboard' },
      document: {
        uid: 'player-uid',
        name: 'Piloto',
        score: 120,
        mode: 'solo',
        wave: 4,
        createdAt: dependencies.timestamp,
      },
    },
  ]);
});

test('saveSoloScore validates score, wave and player name before writing', async () => {
  const dependencies = createDependencies();
  const repository = createScoreRepository(dependencies);

  await assert.rejects(
    repository.saveSoloScore({ score: -1, wave: 1 }),
    /Score must be an integer/,
  );
  await assert.rejects(
    repository.saveSoloScore({ score: 1_000_001, wave: 1 }),
    /Score must be an integer/,
  );
  await assert.rejects(
    repository.saveSoloScore({ score: 0.5, wave: 1 }),
    /Score must be an integer/,
  );
  await assert.rejects(
    repository.saveSoloScore({ score: 1, wave: 0 }),
    /Wave must be a positive integer/,
  );
  await assert.rejects(
    repository.saveSoloScore({ score: 1, wave: 1, name: '                  ' }),
    /Player name must contain/,
  );
  assert.equal(dependencies.writes.length, 0);
});

test('saveSoloScore propagates authentication and Firestore write errors', async () => {
  const dependencies = createDependencies();
  const repository = createScoreRepository(dependencies);
  const authFailure = new Error('Anonymous authentication is disabled.');
  dependencies.authService.signIn = async () => {
    throw authFailure;
  };
  await assert.rejects(
    repository.saveSoloScore({ score: 1, wave: 1 }),
    (error) => error === authFailure,
  );
  assert.equal(dependencies.writes.length, 0);

  dependencies.authService.signIn = async () => 'player-uid';
  const firestoreFailure = new Error('Firestore unavailable.');
  dependencies.firestoreApi.addDoc = async () => {
    throw firestoreFailure;
  };
  await assert.rejects(
    repository.saveSoloScore({ score: 1, wave: 1 }),
    (error) => error === firestoreFailure,
  );
});
