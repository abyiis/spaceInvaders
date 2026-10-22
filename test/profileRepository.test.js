import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProfileRepository } from '../src/net/profileRepository.js';

function createDependencies() {
  const db = {};
  const profiles = new Map();
  const timestamp = { serverTimestamp: true };
  const authService = {
    signIn: async () => 'player-uid',
  };
  const firestoreApi = {
    doc: (_database, collectionName, uid) => ({ path: `${collectionName}/${uid}` }),
    runTransaction: async (_database, operation) => {
      const writes = [];
      const transaction = {
        get: async (profileRef) => {
          const data = profiles.get(profileRef.path);
          return {
            exists: () => data !== undefined,
            data: () => data,
          };
        },
        set: (profileRef, data) => writes.push({ type: 'set', profileRef, data }),
        update: (profileRef, data) => writes.push({ type: 'update', profileRef, data }),
      };
      const result = await operation(transaction);
      for (const write of writes) {
        const existing = profiles.get(write.profileRef.path) ?? {};
        profiles.set(
          write.profileRef.path,
          write.type === 'set' ? write.data : { ...existing, ...write.data },
        );
      }
      return result;
    },
    serverTimestamp: () => timestamp,
  };
  return { authService, db, firestoreApi, profiles, timestamp };
}

test('getDisplayName creates a default Firestore profile when none exists', async () => {
  const dependencies = createDependencies();
  const repository = createProfileRepository(dependencies);

  assert.equal(await repository.getDisplayName(), 'Jugador');
  assert.deepEqual(dependencies.profiles.get('users/player-uid'), {
    displayName: 'Jugador',
    createdAt: dependencies.timestamp,
    bestScore: 0,
    gamesPlayed: 0,
  });
});

test('saveDisplayName preserves profile statistics and validates the alias', async () => {
  const dependencies = createDependencies();
  dependencies.profiles.set('users/player-uid', {
    displayName: 'Old',
    createdAt: dependencies.timestamp,
    bestScore: 500,
    gamesPlayed: 4,
  });
  const repository = createProfileRepository(dependencies);

  assert.equal(await repository.saveDisplayName('  Ace  '), 'Ace');
  assert.deepEqual(dependencies.profiles.get('users/player-uid'), {
    displayName: 'Ace',
    createdAt: dependencies.timestamp,
    bestScore: 500,
    gamesPlayed: 4,
  });
  assert.equal(await repository.getDisplayName(), 'Ace');

  await assert.rejects(repository.saveDisplayName('  '), /must contain 1-16 characters/);
  await assert.rejects(repository.saveDisplayName('seventeen chars!!!'), /must contain 1-16 characters/);
});

test('saveDisplayName creates profile fields and propagates authentication failures', async () => {
  const dependencies = createDependencies();
  const repository = createProfileRepository(dependencies);

  assert.equal(await repository.saveDisplayName('Pilot'), 'Pilot');
  assert.deepEqual(dependencies.profiles.get('users/player-uid'), {
    displayName: 'Pilot',
    createdAt: dependencies.timestamp,
    bestScore: 0,
    gamesPlayed: 0,
  });

  const failure = new Error('Authentication is unavailable.');
  dependencies.authService.signIn = async () => {
    throw failure;
  };
  await assert.rejects(repository.getDisplayName(), (error) => error === failure);
});
