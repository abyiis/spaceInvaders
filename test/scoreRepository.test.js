import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createScoreRepository } from '../src/net/scoreRepository.js';

function createDependencies() {
  const db = {};
  const writes = [];
  const queries = [];
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
    getDocs: async (scoreQuery) => {
      queries.push(scoreQuery);
      return {
        docs: [
          { id: 'first', data: () => ({ name: 'Ace', score: 900, wave: 7 }) },
          { id: 'second', data: () => ({ name: 'Pilot', score: 700, wave: 5 }) },
        ],
      };
    },
    limit: (count) => ({ count }),
    orderBy: (field, direction) => ({ field, direction }),
    query: (...constraints) => ({ constraints }),
    serverTimestamp: () => timestamp,
  };
  return { authService, db, firestoreApi, queries, timestamp, writes };
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

test('getTopScores reads the top 20 ordered by descending score', async () => {
  const dependencies = createDependencies();
  const repository = createScoreRepository(dependencies);

  assert.deepEqual(await repository.getTopScores(), [
    { id: 'first', name: 'Ace', score: 900, wave: 7 },
    { id: 'second', name: 'Pilot', score: 700, wave: 5 },
  ]);
  assert.deepEqual(dependencies.queries, [
    {
      constraints: [
        { name: 'leaderboard' },
        { field: 'score', direction: 'desc' },
        { count: 20 },
      ],
    },
  ]);
});

test('getTopScores propagates authentication and Firestore errors', async () => {
  const dependencies = createDependencies();
  const repository = createScoreRepository(dependencies);
  const authFailure = new Error('Sign-in required.');
  dependencies.authService.signIn = async () => {
    throw authFailure;
  };
  await assert.rejects(repository.getTopScores(), (error) => error === authFailure);

  dependencies.authService.signIn = async () => 'player-uid';
  const queryFailure = new Error('Firestore unavailable.');
  dependencies.firestoreApi.getDocs = async () => {
    throw queryFailure;
  };
  await assert.rejects(repository.getTopScores(), (error) => error === queryFailure);
});
