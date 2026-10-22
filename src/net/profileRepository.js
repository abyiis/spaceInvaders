import {
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';

const DEFAULT_DISPLAY_NAME = 'Jugador';
const MAX_DISPLAY_NAME_LENGTH = 16;

function normalizeDisplayName(name) {
  if (typeof name !== 'string') {
    throw new TypeError('Player name must be text.');
  }
  const normalized = name.trim();
  if (normalized.length === 0 || normalized.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new RangeError(`Player name must contain 1-${MAX_DISPLAY_NAME_LENGTH} characters.`);
  }
  return normalized;
}

/**
 * @param {{
 *   db: import('firebase/firestore').Firestore,
 *   authService: { signIn: () => Promise<string> },
 *   firestoreApi?: {
 *     doc: typeof doc,
 *     runTransaction: typeof runTransaction,
 *     serverTimestamp: typeof serverTimestamp,
 *   },
 * }} options
 */
export function createProfileRepository({
  db,
  authService,
  firestoreApi = { doc, runTransaction, serverTimestamp },
}) {
  async function authenticatedUid() {
    const uid = await authService.signIn();
    if (typeof uid !== 'string' || uid.length === 0) {
      throw new Error('Cannot access a profile without an authenticated user.');
    }
    return uid;
  }

  return {
    async getDisplayName() {
      const uid = await authenticatedUid();
      const profileRef = firestoreApi.doc(db, 'users', uid);
      return firestoreApi.runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(profileRef);
        if (snapshot.exists()) {
          const currentName = snapshot.data()?.displayName;
          if (
            typeof currentName === 'string' &&
            currentName.trim().length > 0 &&
            currentName.trim().length <= MAX_DISPLAY_NAME_LENGTH
          ) {
            return currentName.trim();
          }
          transaction.update(profileRef, { displayName: DEFAULT_DISPLAY_NAME });
          return DEFAULT_DISPLAY_NAME;
        }

        transaction.set(profileRef, {
          displayName: DEFAULT_DISPLAY_NAME,
          createdAt: firestoreApi.serverTimestamp(),
          bestScore: 0,
          gamesPlayed: 0,
        });
        return DEFAULT_DISPLAY_NAME;
      });
    },

    async saveDisplayName(name) {
      const displayName = normalizeDisplayName(name);
      const uid = await authenticatedUid();
      const profileRef = firestoreApi.doc(db, 'users', uid);
      await firestoreApi.runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(profileRef);
        if (snapshot.exists()) {
          transaction.update(profileRef, { displayName });
        } else {
          transaction.set(profileRef, {
            displayName,
            createdAt: firestoreApi.serverTimestamp(),
            bestScore: 0,
            gamesPlayed: 0,
          });
        }
      });
      return displayName;
    },
  };
}
