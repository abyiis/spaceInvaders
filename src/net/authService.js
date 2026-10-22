import { signInAnonymously } from 'firebase/auth';

/**
 * @param {import('firebase/auth').Auth} auth Firebase Auth instance.
 * @param {typeof signInAnonymously} anonymousSignIn Authentication function, injectable for tests.
 */
export function createAuthService(auth, anonymousSignIn = signInAnonymously) {
  return {
    async signIn() {
      if (auth.currentUser) return auth.currentUser.uid;

      const credential = await anonymousSignIn(auth);
      const uid = credential.user?.uid;
      if (!uid) {
        throw new Error('Firebase anonymous sign-in did not return an authenticated user.');
      }

      return uid;
    },

    get uid() {
      return auth.currentUser?.uid ?? null;
    },
  };
}
