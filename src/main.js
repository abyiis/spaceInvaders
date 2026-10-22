import './style.css';
import { C } from './core/constants.js';
import { App } from '@capacitor/app';
import { Haptics } from '@capacitor/haptics';
import { createEffects } from './effects.js';
import { Game } from './game/Game.js';
import { attachInput } from './game/input.js';
import { attachLifecycle } from './lifecycle.js';
import { mountLobby } from './ui/lobby.js';
import { mountMainMenu } from './ui/mainMenu.js';
import { mountRanking } from './ui/ranking.js';
import { createScreenRouter, SCREENS } from './ui/screenRouter.js';
import { mountCredits } from './ui/screens/credits.js';
import { mountResults, scheduleResultsNavigation } from './ui/screens/results.js';
import { mountSplash } from './ui/screens/splash.js';
import { RESULTS_DELAY_MS } from './ui/uiConstants.js';

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
const hasFirebaseConfig = Object.keys(import.meta.glob('./net/firebaseConfig.js')).length > 0;
const saveStatus = document.createElement('p');
saveStatus.className = 'score-save-status';
saveStatus.setAttribute('role', 'status');
saveStatus.setAttribute('aria-live', 'polite');
saveStatus.hidden = true;
ui.append(saveStatus);
let cancelPendingResults = () => {};

async function saveSoloScore(result) {
  saveStatus.hidden = false;
  saveStatus.textContent = 'Guardando puntaje…';
  try {
    const { scoreRepository } = await import('./net/firebase.js');
    await scoreRepository.saveSoloScore({ ...result, name: playerDisplayName });
    saveStatus.textContent = 'Puntaje guardado en el ranking';
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    saveStatus.textContent = `No se pudo guardar el puntaje: ${detail}`;
  }
}

const game = new Game({
  effects,
  onGameOver: (result) => {
    cancelPendingResults();
    cancelPendingResults = scheduleResultsNavigation(router, result, {
      delayMs: RESULTS_DELAY_MS,
    });
    if (result.mode === 'solo' && hasFirebaseConfig) void saveSoloScore(result);
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
  screens: {
    [SCREENS.SPLASH]: mountSplash,
    [SCREENS.CREDITS]: mountCredits,
    [SCREENS.RESULTS]: mountResults,
    [SCREENS.HOME]: (container, _params, nav) => mountMainMenu(container, {
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
    [SCREENS.PLAYING]: () => {
      game.startNewGame();
      const detachInput = attachInput(canvas, game);
      return () => {
        cancelPendingResults();
        detachInput();
        game.pause();
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