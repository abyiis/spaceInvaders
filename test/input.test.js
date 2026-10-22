import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/Game.js';
import { attachInput } from '../src/game/input.js';

function fakeCanvas() {
  const canvas = new EventTarget();
  canvas.getBoundingClientRect = () => ({ left: 0, width: 360 });
  canvas.setPointerCapture = () => {};
  return canvas;
}

test('la entrada no reinicia ni cambia el estado durante Game Over', () => {
  const previousWindow = globalThis.window;
  const fakeWindow = new EventTarget();
  globalThis.window = fakeWindow;
  const game = new Game({ random: () => 0.5 });
  game.score = 120;
  game.triggerGameOver();
  const canvas = fakeCanvas();
  const detach = attachInput(canvas, game);

  try {
    const pointer = new Event('pointerdown', { cancelable: true });
    Object.assign(pointer, { pointerId: 1, clientX: 180 });
    canvas.dispatchEvent(pointer);

    const key = new Event('keydown');
    Object.assign(key, { code: 'Space' });
    fakeWindow.dispatchEvent(key);

    assert.equal(game.isGameOver, true);
    assert.equal(game.score, 120);
  } finally {
    detach();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('al desmontar input se limpian las teclas sostenidas', () => {
  const previousWindow = globalThis.window;
  const fakeWindow = new EventTarget();
  globalThis.window = fakeWindow;
  const game = new Game({ random: () => 0.5 });
  const canvas = fakeCanvas();
  const detach = attachInput(canvas, game);

  try {
    const key = new Event('keydown');
    Object.assign(key, { code: 'ArrowRight' });
    fakeWindow.dispatchEvent(key);
    assert.equal(game.player.moveDir, 1);

    detach();
    assert.equal(game.player.moveDir, 0);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
