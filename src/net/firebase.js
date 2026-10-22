import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';
import { createAuthService } from './authService.js';
import { createProfileRepository } from './profileRepository.js';
import { createRoomRepository } from './roomRepository.js';
import { createScoreRepository } from './scoreRepository.js';
import { resolveFirebaseConfig } from './firebaseConfigResolver.js';

const configModules = import.meta.glob('./firebaseConfig.js', { eager: true });
const firebaseConfig = resolveFirebaseConfig(configModules);
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const authService = createAuthService(auth);
export const rtdb = getDatabase(app);
export const db = getFirestore(app);
export const roomRepository = createRoomRepository({ rtdb, authService });
export const profileRepository = createProfileRepository({ db, authService });
export const scoreRepository = createScoreRepository({ db, authService });
