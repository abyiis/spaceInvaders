import { get, ref, runTransaction, serverTimestamp } from 'firebase/database';

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

/**
 * @param {{
 *   rtdb: import('firebase/database').Database,
 *   authService: { signIn: () => Promise<string> },
 *   databaseApi?: {
 *     get: typeof get,
 *     ref: typeof ref,
 *     runTransaction: typeof runTransaction,
 *     serverTimestamp: typeof serverTimestamp,
 *   },
 *   codeFactory?: () => string,
 *   seedFactory?: () => number,
 * }} options
 */
export function createRoomRepository({
  rtdb,
  authService,
  databaseApi = { get, ref, runTransaction, serverTimestamp },
  codeFactory = generateRoomCode,
  seedFactory = generateSeed,
}) {
  return {
    async createRoom() {
      const uid = await authService.signIn();
      if (typeof uid !== 'string' || uid.length === 0) {
        throw new Error('Cannot create a room without an authenticated user.');
      }

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

        if (result.committed) return { code, seed };
      }

      throw new Error('Could not create a room after several code generation attempts.');
    },

    async joinRoom(inputCode) {
      const code = typeof inputCode === 'string' ? inputCode.trim().toUpperCase() : '';
      if (
        code.length !== ROOM_CODE_LENGTH ||
        !Array.from(code).every((character) => ROOM_CODE_CHARACTERS.includes(character))
      ) {
        throw new Error('Room code must contain exactly five valid characters.');
      }

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
        name: 'Jugador',
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
        meta,
        player: result.snapshot?.val() ?? existingPlayer ?? player,
      };
    },
  };
}
