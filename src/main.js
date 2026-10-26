import './style.css';
import { C } from './core/constants.js';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { createFrameStats } from './core/frameStats.js';
import { DEBUG_TOGGLE_EVENT, isDebugRequested, mountDebugOverlay } from './debug/debugOverlay.js';
import { createEffects } from './effects.js';
import { Game } from './game/Game.js';
import { CoopGateway } from './game/CoopGateway.js';
import { NoopSyncGateway } from './game/SyncGateway.js';
import { attachLifecycle } from './lifecycle.js';
import { lockPortrait } from './orientation.js';
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

/** Al salir de Resultados el host borra la sala (`multiplayer_sync.md` §6, paso 6). */
function cleanUpCoopRoom(result) {
  const room = activeCoopRoom;
  activeCoopRoom = null;
  if (!room || !result.isHost) return;
  room.roomRepository.deleteRoom(room.code)
    .catch((error) => console.warn('No se pudo borrar la sala:', error));
}

/**
 * Abandono voluntario de una partida coop: se libera la presencia y, si el compañero ya no está
 * conectado, se borra la sala (si sigue conectado, él asume el rol de host y la conserva).
 */
async function leaveCoopMatch() {
  const room = activeCoopRoom;
  activeCoopRoom = null;
  const { peerOnline } = (await game.sync.leave?.()) ?? { peerOnline: true };
  if (room && !peerOnline) {
    await room.roomRepository.deleteRoom(room.code)
      .catch((error) => console.warn('No se pudo borrar la sala:', error));
  }
}

/** Solo el host guarda el puntaje del equipo, una vez (`multiplayer_sync.md` §6). */
async function saveCoopScore(result) {
  const { scoreRepository } = await import('./net/firebase.js');
  await scoreRepository.saveCoopScore({
    score: result.score,
    wave: result.wave,
    players: result.players.map((player) => player.uid),
    name: result.players.map((player) => player.name).join(' y '),
  });
}

/** Sala coop de la partida en curso; la usan el cierre de partida y la salida de Resultados. */
let activeCoopRoom = null;

const game = new Game({
  effects,
  onGameOver: (result) => {
    if (result.mode === 'coop' && result.isHost && activeCoopRoom) {
      activeCoopRoom.roomRepository.finishRoom(activeCoopRoom.code)
        .catch((error) => console.warn('No se pudo cerrar la sala:', error));
    }
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

// En la app empaquetada el juego solo se ve en vertical (el lienzo lógico es 9:16).
if (Capacitor.isNativePlatform()) {
  void lockPortrait(ScreenOrientation, {
    onError: (error) => console.warn('No se pudo bloquear la orientación:', error),
  });
}

function showLobby(firebase, room, isHost) {
  const hostUid = isHost ? room.uid : room.meta.hostUid;
  router.show('lobby', { firebase, room, isHost, hostUid });
}

const router = createScreenRouter({
  container: ui,
  backTargets: {
    credits: (params) => params.result ? 'results' : 'home',
    results: 'home',
    lobby: 'home',
    ranking: 'home',
  },
  screens: {
    [SCREENS.SPLASH]: mountSplash,
    [SCREENS.CREDITS]: mountCredits,
    [SCREENS.RESULTS]: (container, { result }, nav) => mountResults(container, {
      result,
      saveScore: !hasFirebaseConfig
        ? undefined
        : result.mode === 'solo'
          ? saveSoloScore
          : result.isHost ? saveCoopScore : undefined,
      bestScoreStore: result.mode === 'solo' ? bestScoreStore : undefined,
      onExit: result.mode === 'coop' ? () => cleanUpCoopRoom(result) : undefined,
    }, nav),
    [SCREENS.HOME]: (container, _params, nav) => mountMainMenu(container, {
      bestScore: bestScoreStore.get(),
      onPlaySolo: () => nav.show(SCREENS.PLAYING),
      onCreateRoom: async () => {
        const firebase = await import('./net/firebase.js');
        const room = await firebase.roomRepository.createRoom({ name: playerDisplayName });
        showLobby(firebase, room, true);
      },
      onJoinRoom: async (code) => {
        const firebase = await import('./net/firebase.js');
        const room = await firebase.roomRepository.joinRoom(code, { name: playerDisplayName });
        showLobby(firebase, room, false);
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
    [SCREENS.PLAYING]: (container, { coop }, nav) => {
      let sync;
      if (coop) {
        if (!Number.isSafeInteger(coop.seed)) {
          throw new Error('The room is missing a valid shared game seed.');
        }
        if (!Number.isFinite(coop.startAt)) {
          throw new Error('The room is missing a valid start time.');
        }
        sync = new CoopGateway({
          roomRepository: coop.roomRepository,
          code: coop.code,
          uid: coop.uid,
          hostUid: coop.hostUid,
          seed: coop.seed,
          startAt: coop.startAt,
          onError: (error) => console.error('Co-op synchronization failed:', error),
        });
        activeCoopRoom = { code: coop.code, roomRepository: coop.roomRepository };
      } else {
        sync = new NoopSyncGateway();
        activeCoopRoom = null;
      }
      game.setSyncGateway(sync);
      const unmount = mountPlaying(container, {
        game,
        canvas,
        onPauseReady: (open) => { openPauseMenu = open ?? (() => {}); },
        onLeaveCoop: leaveCoopMatch,
      }, nav);
      return () => {
        cancelPendingResults();
        unmount();
        game.dispose();
        game.setSyncGateway(new NoopSyncGateway());
      };
    },
    lobby: (container, { firebase, room, isHost, hostUid }, nav) => mountLobby(container, {
      code: room.code,
      uid: room.uid,
      hostUid,
      isHost,
      watchPlayers: firebase.roomRepository.watchPlayers,
      watchRoomStatus: firebase.roomRepository.watchRoomStatus,
      watchPresence: firebase.roomRepository.watchPresence,
      setReady: firebase.roomRepository.setReady,
      startGame: firebase.roomRepository.startGame,
      leaveRoom: firebase.roomRepository.leaveLobby,
      onStart: (meta) => nav.show(SCREENS.PLAYING, {
        coop: {
          code: room.code,
          uid: room.uid,
          hostUid,
          isHost,
          seed: meta.seed ?? room.meta?.seed ?? room.seed,
          startAt: meta.startAt,
          roomRepository: firebase.roomRepository,
        },
      }),
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
  onPlayingBack: () => openPauseMenu(),
});

const frameStats = createFrameStats();
let unmountDebugOverlay = null;

function setDebugOverlay(visible) {
  if (visible && !unmountDebugOverlay) {
    unmountDebugOverlay = mountDebugOverlay(document.body, {
      getStats: () => ({
        frames: frameStats.snapshot(),
        traffic: game.sync.isCoop ? game.sync.traffic?.snapshot() ?? null : null,
      }),
    });
  } else if (!visible && unmountDebugOverlay) {
    unmountDebugOverlay();
    unmountDebugOverlay = null;
  }
}

function readStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Panel de FPS para medir en el teléfono: ?debug=1, marca en localStorage o 5 toques en Créditos.
setDebugOverlay(isDebugRequested({ search: window.location.search, storage: readStorage() }));
window.addEventListener(DEBUG_TOGGLE_EVENT, () => setDebugOverlay(!unmountDebugOverlay));

let last = performance.now();

function frame(now) {
  frameStats.frame(now);
  // Limita dt para que una pestaña en segundo plano no provoque saltos enormes.
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  game.update(dt);
  game.render(ctx);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);