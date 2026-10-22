import './style.css';
import { C } from './core/constants.js';
import { App } from '@capacitor/app';
import { Haptics } from '@capacitor/haptics';
import { createEffects } from './effects.js';
import { Game } from './game/Game.js';
import { attachInput } from './game/input.js';
import { attachLifecycle } from './lifecycle.js';
import { mountMainMenu } from './ui/mainMenu.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Resolución interna = tamaño lógico × densidad de píxeles, para que se vea nítido.
const dpr = Math.min(window.devicePixelRatio || 1, 3);
canvas.width = C.WIDTH * dpr;
canvas.height = C.HEIGHT * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

const effects = createEffects({ haptics: Haptics });
const game = new Game({ effects });
game.pause();

// Los WebViews bloquean el audio hasta un gesto del usuario. Se prueba en varios eventos porque
// en pantallas táctiles solo `pointerup` cuenta como activación; `unlock()` es idempotente.
for (const type of ['pointerdown', 'pointerup', 'keydown']) {
  window.addEventListener(type, () => effects.unlock(), { passive: true });
}

attachLifecycle(game, { app: App });
mountMainMenu(document.getElementById('ui'), () => {
  attachInput(canvas, game);
  game.resume();
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