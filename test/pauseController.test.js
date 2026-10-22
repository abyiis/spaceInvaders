import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPauseController } from '../src/ui/pauseController.js';

function setup(overrides = {}) {
  const calls = [];
  const target = new EventTarget();
  const game = {
    paused: false,
    isGameOver: false,
    sync: { isCoop: false },
    pause() { this.paused = true; calls.push('pause'); },
    resume() { this.paused = false; calls.push('resume'); },
  };
  let inputAttached = true;
  const controller = createPauseController({
    game,
    attachInput: () => {
      calls.push('attach-input');
      inputAttached = true;
      return () => {
        calls.push('detach-input');
        inputAttached = false;
      };
    },
    detachInput: () => {
      calls.push('detach-input');
      inputAttached = false;
    },
    onOpen: () => calls.push('open-menu'),
    onClose: () => calls.push('close-menu'),
    onExit: () => calls.push('exit'),
    eventTarget: target,
    ...overrides,
  });
  return { calls, controller, game, target, inputAttached: () => inputAttached };
}

test('open pausa y desconecta input; resume reanuda y lo vuelve a enganchar', () => {
  const { calls, controller, game, inputAttached } = setup();

  assert.equal(controller.open(), true);
  assert.equal(game.paused, true);
  assert.equal(inputAttached(), false);
  assert.equal(controller.resume(), true);
  assert.equal(game.paused, false);
  assert.equal(inputAttached(), true);
  assert.deepEqual(calls, [
    'pause',
    'detach-input',
    'open-menu',
    'close-menu',
    'resume',
    'attach-input',
  ]);
});

test('exit abandona la partida sin terminarla y cierra la pausa', () => {
  const { calls, controller, game } = setup();
  let gameOverCalls = 0;

  controller.open();
  assert.equal(controller.exit(), true);
  assert.equal(game.isGameOver, false);
  assert.equal(gameOverCalls, 0);
  assert.ok(calls.includes('exit'));
});

test('open no hace nada tras Game Over ni en coop', () => {
  const solo = setup();
  solo.game.isGameOver = true;
  assert.equal(solo.controller.open(), false);

  const coop = setup();
  coop.game.sync.isCoop = true;
  assert.equal(coop.controller.open(), false);
  assert.deepEqual(coop.calls, []);
});

test('open es idempotente y destroy quita teclado y input', () => {
  const { calls, controller, target, inputAttached } = setup();

  assert.equal(controller.open(), true);
  assert.equal(controller.open(), false);
  controller.destroy();
  assert.equal(inputAttached(), false);
  const key = new Event('keydown', { cancelable: true });
  Object.assign(key, { code: 'KeyP' });
  target.dispatchEvent(key);
  assert.equal(calls.filter((call) => call === 'pause').length, 1);
});

test('Escape y P abren y cierran el menú de pausa', () => {
  const { calls, target } = setup();
  const emitKey = (code) => {
    const event = new Event('keydown', { cancelable: true });
    Object.assign(event, { code });
    target.dispatchEvent(event);
  };

  emitKey('Escape');
  emitKey('KeyP');

  assert.equal(calls.filter((call) => call === 'open-menu').length, 1);
  assert.equal(calls.filter((call) => call === 'close-menu').length, 1);
});
