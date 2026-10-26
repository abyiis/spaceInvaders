import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  get as getRtdb,
  ref as rtdbRef,
  set as setRtdb,
  update as updateRtdb,
} from 'firebase/database';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { createRoomRepository } from '../src/net/roomRepository.js';

const emulatorAvailable = Boolean(
  process.env.FIREBASE_DATABASE_EMULATOR_HOST &&
  process.env.FIRESTORE_EMULATOR_HOST,
);

describe('Firebase security rules', { skip: !emulatorAvailable }, () => {
  let testEnvironment;

  before(async () => {
    const [databaseRules, firestoreRules] = await Promise.all([
      readFile(new URL('../firebase/database.rules.json', import.meta.url), 'utf8'),
      readFile(new URL('../firebase/firestore.rules', import.meta.url), 'utf8'),
    ]);
    testEnvironment = await initializeTestEnvironment({
      projectId: 'demo-space-coop',
      database: { rules: databaseRules },
      firestore: { rules: firestoreRules },
    });
  });

  beforeEach(async () => {
    await testEnvironment.clearDatabase();
    await testEnvironment.clearFirestore();
  });

  after(async () => {
    await testEnvironment?.cleanup();
  });

  it('Realtime Database restricts reads and player writes to authenticated identities', async () => {
    const hostDatabase = testEnvironment.authenticatedContext('host').database();
    const guestDatabase = testEnvironment.authenticatedContext('guest').database();
    const anonymousDatabase = testEnvironment.unauthenticatedContext().database();
    const meta = {
      hostUid: 'host',
      seed: 123,
      status: 'lobby',
      createdAt: 1,
      maxPlayers: 2,
    };

    await assertSucceeds(setRtdb(rtdbRef(hostDatabase, 'rooms/ABCDE/meta'), meta));
    await assertSucceeds(getRtdb(rtdbRef(guestDatabase, 'rooms/ABCDE')));
    await assertFails(getRtdb(rtdbRef(hostDatabase, 'rooms')));
    await assertFails(getRtdb(rtdbRef(anonymousDatabase, 'rooms/ABCDE')));

    const player = {
      name: 'Host',
      x: 0,
      ts: 1,
      ready: false,
      connected: true,
    };
    await assertSucceeds(setRtdb(rtdbRef(hostDatabase, 'rooms/ABCDE/players/host'), player));
    await assertSucceeds(setRtdb(
      rtdbRef(guestDatabase, 'rooms/ABCDE/players/guest'),
      { ...player, name: 'Guest' },
    ));
    await assertFails(setRtdb(
      rtdbRef(hostDatabase, 'rooms/ABCDE/players/guest'),
      { ...player, name: 'Impersonated' },
    ));
    await assertFails(setRtdb(
      rtdbRef(hostDatabase, 'rooms/ABCDE/players/host'),
      { ...player, x: 1.1 },
    ));
  });

  it('creates a room with transactional metadata and host registration', async () => {
    const database = testEnvironment.authenticatedContext('host').database();
    const repository = createRoomRepository({
      rtdb: database,
      authService: { signIn: async () => 'host' },
      codeFactory: () => 'ABCDE',
      seedFactory: () => 123,
    });

    const room = await repository.createRoom({ name: 'Host' });
    assert.equal(room.code, 'ABCDE');
    assert.equal(room.uid, 'host');
    const meta = (await getRtdb(rtdbRef(database, 'rooms/ABCDE/meta'))).val();
    assert.deepEqual({ ...meta, createdAt: undefined }, {
      hostUid: 'host',
      seed: 123,
      status: 'lobby',
      createdAt: undefined,
      maxPlayers: 2,
    });
    assert.equal(typeof meta.createdAt, 'number');
    const player = (await getRtdb(rtdbRef(database, 'rooms/ABCDE/players/host'))).val();
    assert.equal(player.name, 'Host');
    assert.equal(player.connected, true);
    assert.equal(typeof player.ts, 'number');
  });

  it('Realtime Database restricts room state to the host and event writes to their owner', async () => {
    const hostDatabase = testEnvironment.authenticatedContext('host').database();
    const guestDatabase = testEnvironment.authenticatedContext('guest').database();
    await setRtdb(rtdbRef(hostDatabase, 'rooms/ABCDE/meta'), {
      hostUid: 'host',
      seed: 123,
      status: 'lobby',
      createdAt: 1,
      maxPlayers: 2,
    });

    await assertSucceeds(setRtdb(
      rtdbRef(hostDatabase, 'rooms/ABCDE/state'),
      { wave: 1, score: 0, status: 'lobby', lives: { host: 3 } },
    ));
    await assertFails(updateRtdb(
      rtdbRef(guestDatabase, 'rooms/ABCDE/state'),
      { score: 500 },
    ));
    await assertSucceeds(setRtdb(
      rtdbRef(guestDatabase, 'rooms/ABCDE/events/event-1'),
      { type: 'shot', uid: 'guest', t: 1, x: 0.5 },
    ));
    await assertFails(setRtdb(
      rtdbRef(guestDatabase, 'rooms/ABCDE/events/event-2'),
      { type: 'shot', uid: 'host', t: 1, x: 0.5 },
    ));
    await assertFails(updateRtdb(
      rtdbRef(guestDatabase, 'rooms/ABCDE/events/event-1'),
      { t: 2 },
    ));
  });

  it('Realtime Database solo admite eventos del host (state, phase, game-over, enemy-shot) firmados por el host', async () => {
    const hostDatabase = testEnvironment.authenticatedContext('host').database();
    const guestDatabase = testEnvironment.authenticatedContext('guest').database();
    await setRtdb(rtdbRef(hostDatabase, 'rooms/ABCDE/meta'), {
      hostUid: 'host',
      seed: 123,
      status: 'playing',
      createdAt: 1,
      maxPlayers: 2,
    });

    await assertSucceeds(setRtdb(
      rtdbRef(hostDatabase, 'rooms/ABCDE/events/state-1'),
      { type: 'state', uid: 'host', t: 12.5, score: 120, lives: 2, wave: 3 },
    ));
    await assertFails(setRtdb(
      rtdbRef(guestDatabase, 'rooms/ABCDE/events/state-2'),
      { type: 'state', uid: 'guest', t: 12.5, score: 999999, lives: 3, wave: 3 },
    ));
    await assertFails(setRtdb(
      rtdbRef(guestDatabase, 'rooms/ABCDE/events/enemy-1'),
      { type: 'enemy-shot', uid: 'guest', t: 1, x: 0.5, y: 0.5, vy: 180 },
    ));
    await assertFails(setRtdb(
      rtdbRef(hostDatabase, 'rooms/ABCDE/events/state-3'),
      { type: 'state', uid: 'host', t: 1, score: 0, lives: 100, wave: 1 },
    ));
    await assertFails(setRtdb(
      rtdbRef(hostDatabase, 'rooms/ABCDE/events/state-4'),
      { type: 'state', uid: 'host', t: 1, score: -1, lives: 1, wave: 1 },
    ));
    await assertSucceeds(setRtdb(
      rtdbRef(guestDatabase, 'rooms/ABCDE/events/hit-1'),
      { type: 'hit', uid: 'guest', t: 3 },
    ));

    await assertSucceeds(setRtdb(
      rtdbRef(hostDatabase, 'rooms/ABCDE/events/phase-1'),
      { type: 'phase', uid: 'host', kind: 'boss', wave: 3, t: 40.2, score: 840, lives: 3 },
    ));
    await assertSucceeds(setRtdb(
      rtdbRef(hostDatabase, 'rooms/ABCDE/events/phase-2'),
      { type: 'phase', uid: 'host', kind: 'wave', wave: 4, t: 70, score: 1500, lives: 4, bossDefeated: true },
    ));
    await assertFails(setRtdb(
      rtdbRef(guestDatabase, 'rooms/ABCDE/events/phase-3'),
      { type: 'phase', uid: 'guest', kind: 'wave', wave: 9, t: 70, score: 1500, lives: 3 },
    ));
    await assertFails(setRtdb(
      rtdbRef(hostDatabase, 'rooms/ABCDE/events/phase-4'),
      { type: 'phase', uid: 'host', kind: 'invasion', wave: 4, t: 70, score: 1, lives: 3 },
    ));
    await assertSucceeds(setRtdb(
      rtdbRef(hostDatabase, 'rooms/ABCDE/events/over-1'),
      { type: 'game-over', uid: 'host', t: 120, score: 4200, wave: 7, kills: { host: 20, guest: 18 } },
    ));
    await assertFails(setRtdb(
      rtdbRef(guestDatabase, 'rooms/ABCDE/events/over-2'),
      { type: 'game-over', uid: 'guest', t: 120, score: 1, wave: 1, kills: { guest: 1 } },
    ));
    await assertFails(setRtdb(
      rtdbRef(hostDatabase, 'rooms/ABCDE/events/over-3'),
      { type: 'game-over', uid: 'host', t: 120, score: 1, wave: 1, kills: { host: -5 } },
    ));
  });

  it('Realtime Database permite relevar al host solo si figura desconectado y quien lo releva está en la sala', async () => {
    const hostDatabase = testEnvironment.authenticatedContext('host').database();
    const guestDatabase = testEnvironment.authenticatedContext('guest').database();
    const strangerDatabase = testEnvironment.authenticatedContext('stranger').database();
    await setRtdb(rtdbRef(hostDatabase, 'rooms/ABCDE/meta'), {
      hostUid: 'host',
      seed: 123,
      status: 'playing',
      createdAt: 1,
      startAt: 5,
      maxPlayers: 2,
    });
    const player = { name: 'P', x: 0.5, ts: 1, ready: true, connected: true };
    await setRtdb(rtdbRef(hostDatabase, 'rooms/ABCDE/players/host'), player);
    await setRtdb(rtdbRef(guestDatabase, 'rooms/ABCDE/players/guest'), { ...player, name: 'G' });

    const guestRepository = createRoomRepository({
      rtdb: guestDatabase,
      authService: { signIn: async () => 'guest' },
    });
    assert.equal(await guestRepository.claimHost('ABCDE', 'host').catch(() => false), false);
    assert.equal((await getRtdb(rtdbRef(hostDatabase, 'rooms/ABCDE/meta/hostUid'))).val(), 'host');

    await updateRtdb(rtdbRef(hostDatabase, 'rooms/ABCDE/players/host'), { connected: false });
    await assertFails(updateRtdb(rtdbRef(strangerDatabase, 'rooms/ABCDE/meta'), { hostUid: 'stranger' }));
    await assertFails(updateRtdb(rtdbRef(guestDatabase, 'rooms/ABCDE/meta'), { hostUid: 'guest', seed: 1 }));
    assert.equal(await guestRepository.claimHost('ABCDE', 'host'), true);
    assert.equal((await getRtdb(rtdbRef(hostDatabase, 'rooms/ABCDE/meta/hostUid'))).val(), 'guest');

    await assertSucceeds(setRtdb(
      rtdbRef(guestDatabase, 'rooms/ABCDE/events/phase-9'),
      { type: 'phase', uid: 'guest', kind: 'wave', wave: 2, t: 9, score: 50, lives: 3 },
    ));
    await assertFails(setRtdb(
      rtdbRef(hostDatabase, 'rooms/ABCDE/events/phase-10'),
      { type: 'phase', uid: 'host', kind: 'wave', wave: 3, t: 19, score: 90, lives: 3 },
    ));
  });

  it('Firestore profiles are private to their owner', async () => {
    const owner = testEnvironment.authenticatedContext('owner').firestore();
    const otherUser = testEnvironment.authenticatedContext('other').firestore();
    const anonymous = testEnvironment.unauthenticatedContext().firestore();
    const profile = {
      displayName: 'Pilot',
      createdAt: new Date(),
      bestScore: 0,
      gamesPlayed: 0,
    };

    await assertSucceeds(setDoc(doc(owner, 'users/owner'), profile));
    await assertSucceeds(getDoc(doc(owner, 'users/owner')));
    await assertFails(getDoc(doc(otherUser, 'users/owner')));
    await assertFails(setDoc(doc(otherUser, 'users/owner'), profile));
    await assertFails(getDoc(doc(anonymous, 'users/owner')));
  });

  it('Firestore leaderboard permits authenticated valid entries and rejects invalid mutations', async () => {
    const owner = testEnvironment.authenticatedContext('owner').firestore();
    const otherUser = testEnvironment.authenticatedContext('other').firestore();
    const anonymous = testEnvironment.unauthenticatedContext().firestore();
    const scores = collection(owner, 'leaderboard');
    const entry = {
      uid: 'owner',
      name: 'Pilot',
      score: 100,
      mode: 'solo',
      wave: 2,
      createdAt: new Date(),
    };

    const created = await assertSucceeds(addDoc(scores, entry));
    await assertSucceeds(getDoc(doc(owner, 'leaderboard', created.id)));
    await assertSucceeds(getDocs(collection(otherUser, 'leaderboard')));
    await assertFails(getDocs(collection(anonymous, 'leaderboard')));
    await assertFails(addDoc(scores, { ...entry, uid: 'other' }));
    await assertFails(addDoc(scores, { ...entry, score: 1_000_001 }));
    await assertFails(addDoc(scores, { ...entry, score: 1.5 }));
    await assertFails(addDoc(scores, { ...entry, mode: 'coop' }));
    await assertFails(addDoc(scores, { ...entry, mode: 'coop', players: ['owner'] }));
    await assertFails(addDoc(scores, { ...entry, mode: 'coop', players: ['other', 'third'] }));
    await assertSucceeds(addDoc(scores, { ...entry, mode: 'coop', players: ['owner', 'other'], name: 'Ana y Beto' }));
    await assertFails(updateDoc(doc(owner, 'leaderboard', created.id), { score: 200 }));
    await assertFails(deleteDoc(doc(owner, 'leaderboard', created.id)));
  });
});
