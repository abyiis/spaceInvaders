import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';

const MAX_SCORE = 1_000_000;
const MAX_PLAYER_NAME_LENGTH = 16;

/**
 * @param {{
 *   db: import('firebase/firestore').Firestore,
 *   authService: { signIn: () => Promise<string> },
 *   firestoreApi?: {
 *     addDoc: typeof addDoc,
 *     collection: typeof collection,
 *     getDocs: typeof getDocs,
 *     limit: typeof limit,
 *     orderBy: typeof orderBy,
 *     query: typeof query,
 *     serverTimestamp: typeof serverTimestamp,
 *   },
 * }} options
 */
export function createScoreRepository({
  db,
  authService,
  firestoreApi = { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp },
}) {
  return {
    async saveSoloScore({ score, wave, name = 'Jugador' }) {
      if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
        throw new RangeError(`Score must be an integer between 0 and ${MAX_SCORE}.`);
      }
      if (!Number.isInteger(wave) || wave < 1) {
        throw new RangeError('Wave must be a positive integer.');
      }
      if (
        typeof name !== 'string' ||
        name.trim().length === 0 ||
        name.trim().length > MAX_PLAYER_NAME_LENGTH
      ) {
        throw new RangeError(`Player name must contain 1-${MAX_PLAYER_NAME_LENGTH} characters.`);
      }

      const uid = await authService.signIn();
      if (typeof uid !== 'string' || uid.length === 0) {
        throw new Error('Cannot save a score without an authenticated user.');
      }

      const document = await firestoreApi.addDoc(
        firestoreApi.collection(db, 'leaderboard'),
        {
          uid,
          name: name.trim(),
          score,
          mode: 'solo',
          wave,
          createdAt: firestoreApi.serverTimestamp(),
        },
      );
      return document.id;
    },

    async getTopScores() {
      const uid = await authService.signIn();
      if (typeof uid !== 'string' || uid.length === 0) {
        throw new Error('Cannot read the leaderboard without an authenticated user.');
      }
      const scoresQuery = firestoreApi.query(
        firestoreApi.collection(db, 'leaderboard'),
        firestoreApi.orderBy('score', 'desc'),
        firestoreApi.limit(20),
      );
      const snapshot = await firestoreApi.getDocs(scoresQuery);
      return snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      }));
    },
  };
}
