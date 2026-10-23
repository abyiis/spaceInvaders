import {
  get,
  onChildAdded,
  onDisconnect,
  onValue,
  push,
  ref,
  runTransaction,
  set,
  serverTimestamp,
  update,
} from 'firebase/database';

const ROOM_CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 5;
const ROOM_CREATION_ATTEMPTS = 5;

function secureRandomBytes(target) {
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) {
    throw new Error('Secure random number generation is unavailable in this environment.');
  }
  return crypto.getRandomValues(target);
}

function generateRoomCode() {
  const bytes = secureRandomBytes(new Uint8Array(ROOM_CODE_LENGTH));
  return Array.from(
    bytes,
    (byte) => ROOM_CODE_CHARACTERS[byte % ROOM_CODE_CHARACTERS.length],
  ).join('');
}

function generateSeed() {
  return secureRandomBytes(new Uint32Array(1))[0];
}

function normalizePlayerName(name) {
  if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 16) {
    throw new Error('Player name must contain 1-16 characters.');
  }
  return name.trim();
}

/**
 * @param {{
 *   rtdb: import('firebase/database').Database,
 *   authService: { signIn: () => Promise<string> },
 *   databaseApi?: {
 *     get: typeof get,
 *     onChildAdded: typeof onChildAdded,
 *     onDisconnect: typeof onDisconnect,
 *     onValue: typeof onValue,
 *     push: typeof push,
 *     ref: typeof ref,
 *     runTransaction: typeof runTransaction,
 *     serverTimestamp: typeof serverTimestamp,
 *     update: typeof update,
 *   },
 *   codeFactory?: () => string,
 *   seedFactory?: () => number,
 * }} options
 */
export function createRoomRepository({
  rtdb,
  authService,
  databaseApi = {
    get,
    onChildAdded,
    onDisconnect,
    onValue,
    push,
    ref,
    runTransaction,
    set,
    serverTimestamp,
    update,
  },
  codeFactory = generateRoomCode,
  seedFactory = generateSeed,
}) {
  return {
    async createRoom({ name = 'Jugador' } = {}) {
      const uid = await authService.signIn();
      if (typeof uid !== 'string' || uid.length === 0) {
        throw new Error('Cannot create a room without an authenticated user.');
      }
      const playerName = normalizePlayerName(name);

      const seed = seedFactory();
      for (let attempt = 0; attempt < ROOM_CREATION_ATTEMPTS; attempt += 1) {
        const code = codeFactory();
        if (
          typeof code !== 'string' ||
          code.length !== ROOM_CODE_LENGTH ||
          !Array.from(code).every((character) => ROOM_CODE_CHARACTERS.includes(character))
        ) {
          throw new Error('Room code generator returned an invalid code.');
        }

        const roomMetaRef = databaseApi.ref(rtdb, `rooms/${code}/meta`);
        const result = await databaseApi.runTransaction(
          roomMetaRef,
          (currentData) =>
            currentData === null
              ? {
                  hostUid: uid,
                  seed,
                  status: 'lobby',
                  createdAt: databaseApi.serverTimestamp(),
                  maxPlayers: 2,
                }
              : undefined,
          { applyLocally: false },
        );

        if (result.committed) {
          const player = {
            name: playerName,
            x: 0,
            ts: databaseApi.serverTimestamp(),
            ready: false,
            connected: true,
          };
          const playerRef = databaseApi.ref(rtdb, `rooms/${code}/players/${uid}`);
          const playerResult = await databaseApi.runTransaction(
            playerRef,
            (currentData) => currentData === null ? player : undefined,
            { applyLocally: false },
          );
          if (!playerResult.committed) {
            throw new Error('Room was created, but the host player could not be registered.');
          }
          return { code, seed, uid, player };
        }
      }

      throw new Error('Could not create a room after several code generation attempts.');
    },

    async joinRoom(inputCode, { name = 'Jugador' } = {}) {
      const code = typeof inputCode === 'string' ? inputCode.trim().toUpperCase() : '';
      if (
        code.length !== ROOM_CODE_LENGTH ||
        !Array.from(code).every((character) => ROOM_CODE_CHARACTERS.includes(character))
      ) {
        throw new Error('Room code must contain exactly five valid characters.');
      }
      const playerName = normalizePlayerName(name);

      const uid = await authService.signIn();
      if (typeof uid !== 'string' || uid.length === 0) {
        throw new Error('Cannot join a room without an authenticated user.');
      }

      const [metaSnapshot, playersSnapshot] = await Promise.all([
        databaseApi.get(databaseApi.ref(rtdb, `rooms/${code}/meta`)),
        databaseApi.get(databaseApi.ref(rtdb, `rooms/${code}/players`)),
      ]);
      if (!metaSnapshot.exists()) {
        throw new Error('Room does not exist.');
      }

      const meta = metaSnapshot.val();
      if (meta.status !== 'lobby') {
        throw new Error('Room is not accepting players.');
      }

      const players = playersSnapshot.val() ?? {};
      const existingPlayer = players[uid];
      const maxPlayers = Number.isInteger(meta.maxPlayers) ? meta.maxPlayers : 2;
      if (!existingPlayer && Object.keys(players).length >= maxPlayers) {
        throw new Error('Room is full.');
      }

      const player = {
        name: playerName,
        x: 0,
        ts: databaseApi.serverTimestamp(),
        ready: false,
        connected: true,
      };
      const playerRef = databaseApi.ref(rtdb, `rooms/${code}/players/${uid}`);
      const result = await databaseApi.runTransaction(
        playerRef,
        (currentData) => currentData === null ? player : undefined,
        { applyLocally: false },
      );

      if (!result.committed && !existingPlayer) {
        throw new Error('Could not reserve a player slot. Please try joining again.');
      }

      return {
        code,
        uid,
        meta,
        player: result.snapshot?.val() ?? existingPlayer ?? player,
      };
    },

    watchPlayers(inputCode, onPlayers, onError) {
      const code = typeof inputCode === 'string' ? inputCode.trim().toUpperCase() : '';
      if (
        code.length !== ROOM_CODE_LENGTH ||
        !Array.from(code).every((character) => ROOM_CODE_CHARACTERS.includes(character))
      ) {
        throw new Error('Room code must contain exactly five valid characters.');
      }
      if (typeof onPlayers !== 'function' || typeof onError !== 'function') {
        throw new TypeError('Player subscription callbacks must be functions.');
      }

      return databaseApi.onValue(
        databaseApi.ref(rtdb, `rooms/${code}/players`),
        (snapshot) => onPlayers(snapshot.val() ?? {}),
        onError,
      );
    },

    async setReady(inputCode, ready) {
      const code = typeof inputCode === 'string' ? inputCode.trim().toUpperCase() : '';
      if (
        code.length !== ROOM_CODE_LENGTH ||
        !Array.from(code).every((character) => ROOM_CODE_CHARACTERS.includes(character))
      ) {
        throw new Error('Room code must contain exactly five valid characters.');
      }
      if (typeof ready !== 'boolean') {
        throw new TypeError('Ready state must be a boolean.');
      }

      const uid = await authService.signIn();
      if (typeof uid !== 'string' || uid.length === 0) {
        throw new Error('Cannot update ready state without an authenticated user.');
      }
      await databaseApi.update(
        databaseApi.ref(rtdb, `rooms/${code}/players/${uid}`),
        { ready },
      );
    },

    async startGame(inputCode) {
      const code = typeof inputCode === 'string' ? inputCode.trim().toUpperCase() : '';
      if (
        code.length !== ROOM_CODE_LENGTH
        || !Array.from(code).every((character) => ROOM_CODE_CHARACTERS.includes(character))
      ) {
        throw new Error('Room code must contain exactly five valid characters.');
      }

      const uid = await authService.signIn();
      const [metaSnapshot, playersSnapshot] = await Promise.all([
        databaseApi.get(databaseApi.ref(rtdb, `rooms/${code}/meta`)),
        databaseApi.get(databaseApi.ref(rtdb, `rooms/${code}/players`)),
      ]);
      const meta = metaSnapshot.val();
      if (!meta || meta.hostUid !== uid) {
        throw new Error('Only the room host can start the game.');
      }
      const players = Object.values(playersSnapshot.val() ?? {});
      if (
        players.length < 2
        || players.some((player) => player.ready !== true || player.connected !== true)
      ) {
        throw new Error('Both players must be connected and ready before starting.');
      }

      const result = await databaseApi.runTransaction(
        databaseApi.ref(rtdb, `rooms/${code}/meta`),
        (currentData) => {
          if (!currentData || currentData.hostUid !== uid || currentData.status !== 'lobby') {
            return undefined;
          }
          return {
            ...currentData,
            status: 'playing',
            startAt: databaseApi.serverTimestamp(),
          };
        },
        { applyLocally: false },
      );
      if (!result.committed) throw new Error('The room could not be started.');
      return { code, seed: meta.seed, hostUid: uid };
    },

    watchRoomStatus(inputCode, onStatus, onError) {
      const code = typeof inputCode === 'string' ? inputCode.trim().toUpperCase() : '';
      if (
        code.length !== ROOM_CODE_LENGTH
        || !Array.from(code).every((character) => ROOM_CODE_CHARACTERS.includes(character))
      ) {
        throw new Error('Room code must contain exactly five valid characters.');
      }
      if (typeof onStatus !== 'function' || typeof onError !== 'function') {
        throw new TypeError('Room status callbacks must be functions.');
      }
      return databaseApi.onValue(
        databaseApi.ref(rtdb, `rooms/${code}/meta`),
        (snapshot) => onStatus(snapshot.val() ?? null),
        onError,
      );
    },

    async publishPlayerX(inputCode, x) {
      const code = typeof inputCode === 'string' ? inputCode.trim().toUpperCase() : '';
      if (
        code.length !== ROOM_CODE_LENGTH
        || !Array.from(code).every((character) => ROOM_CODE_CHARACTERS.includes(character))
      ) {
        throw new Error('Room code must contain exactly five valid characters.');
      }
      if (!Number.isFinite(x) || x < 0 || x > 1) {
        throw new RangeError('Player x position must be normalized between 0 and 1.');
      }
      const uid = await authService.signIn();
      if (typeof uid !== 'string' || uid.length === 0) {
        throw new Error('Cannot publish a player position without an authenticated user.');
      }
      await databaseApi.update(
        databaseApi.ref(rtdb, `rooms/${code}/players/${uid}`),
        { x },
      );
    },

    async emitGameEvent(inputCode, event) {
      const code = typeof inputCode === 'string' ? inputCode.trim().toUpperCase() : '';
      if (
        code.length !== ROOM_CODE_LENGTH
        || !Array.from(code).every((character) => ROOM_CODE_CHARACTERS.includes(character))
      ) {
        throw new Error('Room code must contain exactly five valid characters.');
      }
      if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
        throw new TypeError('A valid game event is required.');
      }
      const uid = await authService.signIn();
      if (typeof uid !== 'string' || uid.length === 0) {
        throw new Error('Cannot publish a game event without an authenticated user.');
      }
      const eventRef = databaseApi.push(databaseApi.ref(rtdb, `rooms/${code}/events`));
      await databaseApi.set(eventRef, {
        ...event,
        uid,
        t: Number.isFinite(event.t) ? event.t : 0,
      });
    },

    watchGameEvents(inputCode, onEvent, onError) {
      const code = typeof inputCode === 'string' ? inputCode.trim().toUpperCase() : '';
      if (
        code.length !== ROOM_CODE_LENGTH
        || !Array.from(code).every((character) => ROOM_CODE_CHARACTERS.includes(character))
      ) {
        throw new Error('Room code must contain exactly five valid characters.');
      }
      if (typeof onEvent !== 'function' || typeof onError !== 'function') {
        throw new TypeError('Game event callbacks must be functions.');
      }
      return databaseApi.onChildAdded(
        databaseApi.ref(rtdb, `rooms/${code}/events`),
        (snapshot) => onEvent(snapshot.key, snapshot.val()),
        onError,
      );
    },

    watchPresence(inputCode, uid, onError) {
      const code = typeof inputCode === 'string' ? inputCode.trim().toUpperCase() : '';
      if (
        code.length !== ROOM_CODE_LENGTH ||
        !Array.from(code).every((character) => ROOM_CODE_CHARACTERS.includes(character))
      ) {
        throw new Error('Room code must contain exactly five valid characters.');
      }
      if (typeof uid !== 'string' || uid.length === 0) {
        throw new Error('A valid authenticated uid is required for room presence.');
      }
      if (typeof onError !== 'function') {
        throw new TypeError('Presence error callback must be a function.');
      }

      const playerRef = databaseApi.ref(rtdb, `rooms/${code}/players/${uid}`);
      let disposed = false;
      let queue = Promise.resolve();
      const unsubscribe = databaseApi.onValue(
        databaseApi.ref(rtdb, '.info/connected'),
        (snapshot) => {
          if (disposed || snapshot.val() !== true) return;
          queue = queue
            .then(async () => {
              if (disposed) return;
              const disconnect = databaseApi.onDisconnect(playerRef);
              await disconnect.update({ connected: false });
              if (disposed) {
                await disconnect.cancel();
                return;
              }
              await databaseApi.update(playerRef, { connected: true });
            })
            .catch((error) => {
              if (!disposed) onError(error);
            });
        },
        onError,
      );

      return async () => {
        if (disposed) return;
        disposed = true;
        unsubscribe();
        await queue;
        await databaseApi.update(playerRef, { connected: false });
        await databaseApi.onDisconnect(playerRef).cancel();
      };
    },
  };
}
