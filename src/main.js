import './style.css';
import { C } from './core/constants.js';
import { App } from '@capacitor/app';
import { Haptics } from '@capacitor/haptics';
import { createEffects } from './effects.js';
import { Game } from './game/Game.js';
import { attachLifecycle } from './lifecycle.js';
import { mountLobby } from './ui/lobby.js';
import { mountMainMenu } from './ui/mainMenu.js';
import { mountRanking } from './ui/ranking.js';
import { createBestScoreStore } from './ui/bestScore.js';
import { createScreenRouter, SCREENS } from './ui/screenRouter.js';
import { mountCredits } from './ui/screens/credits.js';
import { mountPlaying } from './ui/screens/playing.js';
import { mountResults, scheduleResultsNavigation } from './ui/screens/results.js';
import { mountSplash } from './ui/screens/splash.js';
import { RESULTS_DELAY_MS } from './ui/uiConstants.js';
import { attachBackButton } from './ui/backButton.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Resolución interna = tamaño lógico × densidad de píxeles, para que se vea nítido.
const dpr = Math.min(window.devicePixelRatio || 1, 3);
canvas.width = C.WIDTH * dpr;
canvas.height = C.HEIGHT * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

const effects = createEffects({ haptics: Haptics });
const ui = document.getElementById('ui');
let playerDisplayName = 'Jugador';
const bestScoreStore = createBestScoreStore();
const hasFirebaseConfig = Object.keys(import.meta.glob('./net/firebaseConfig.js')).length > 0;
let cancelPendingResults = () => {};
let openPauseMenu = () => {};

async function saveSoloScore(result) {
  const { scoreRepository } = await import('./net/firebase.js');
  await scoreRepository.saveSoloScore({ ...result, name: playerDisplayName });
}

const game = new Game({
  effects,
  onGameOver: (result) => {
    ui.querySelector('[data-action="pause"]')?.setAttribute('hidden', '');
    cancelPendingResults();
    cancelPendingResults = scheduleResultsNavigation(router, result, {
      delayMs: RESULTS_DELAY_MS,
    });
  },
});
game.pause();

// Los WebViews bloquean el audio hasta un gesto del usuario. Se prueba en varios eventos porque
// en pantallas táctiles solo `pointerup` cuenta como activación; `unlock()` es idempotente.
for (const type of ['pointerdown', 'pointerup', 'keydown']) {
  window.addEventListener(type, () => effects.unlock(), { passive: true });
}

attachLifecycle(game, { app: App });

function showLobby(firebase, room) {
  router.show('lobby', { firebase, room });
}

const router = createScreenRouter({
  container: ui,
  backTargets: {
    credits: 'home',
    results: 'home',
    lobby: 'home',
    ranking: 'home',
  },
  screens: {
    [SCREENS.SPLASH]: mountSplash,
    [SCREENS.CREDITS]: mountCredits,
    [SCREENS.RESULTS]: (container, { result }, nav) => mountResults(container, {
      result,
      saveScore: result.mode === 'solo' && hasFirebaseConfig ? saveSoloScore : undefined,
      bestScoreStore: result.mode === 'solo' ? bestScoreStore : undefined,
    }, nav),
    [SCREENS.HOME]: (container, _params, nav) => mountMainMenu(container, {
      bestScore: bestScoreStore.get(),
      onPlaySolo: () => nav.show(SCREENS.PLAYING),
      onShowCredits: () => nav.show(SCREENS.CREDITS),
      onCreateRoom: async () => {
        const firebase = await import('./net/firebase.js');
        const room = await firebase.roomRepository.createRoom({ name: playerDisplayName });
        showLobby(firebase, room);
      },
      onJoinRoom: async (code) => {
        const firebase = await import('./net/firebase.js');
        const room = await firebase.roomRepository.joinRoom(code, { name: playerDisplayName });
        showLobby(firebase, room);
      },
      onShowRanking: async () => {
        const { scoreRepository } = await import('./net/firebase.js');
        nav.show('ranking', { scoreRepository });
      },
      onLoadAlias: async () => {
        const { profileRepository } = await import('./net/firebase.js');
        playerDisplayName = await profileRepository.getDisplayName();
        return playerDisplayName;
      },
      onSaveAlias: async (name) => {
        const { profileRepository } = await import('./net/firebase.js');
        playerDisplayName = await profileRepository.saveDisplayName(name);
        return playerDisplayName;
      },
    }),
    [SCREENS.PLAYING]: (container, _params, nav) => {
      const unmount = mountPlaying(container, {
        game,
        canvas,
        onPauseReady: (open) => { openPauseMenu = open ?? (() => {}); },
      }, nav);
      return () => {
        cancelPendingResults();
        unmount();
      };
    },
    lobby: (container, { firebase, room }, nav) => mountLobby(container, {
      code: room.code,
      uid: room.uid,
      watchPlayers: firebase.roomRepository.watchPlayers,
      watchPresence: firebase.roomRepository.watchPresence,
      setReady: firebase.roomRepository.setReady,
      onBack: () => nav.show(SCREENS.HOME),
    }),
    ranking: (container, { scoreRepository }, nav) => mountRanking(container, {
      loadScores: () => scoreRepository.getTopScores(),
      onBack: () => nav.show(SCREENS.HOME),
    }),
  },
});

router.show(SCREENS.SPLASH);
attachBackButton(router, {
  app: App,
  onPlayingBack: () => {
    if (!game.sync.isCoop) openPauseMenu();
  },
});

let last = performance.now();

function frame(now) {
  // Limita dt para que una pestaña en segundo plano no provoque saltos enormes.
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  game.update(dt);
  game.render(ctx);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);