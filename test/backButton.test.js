import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachBackButton, handleBackButton } from '../src/ui/backButton.js';

function fakeRouter(current) {
  const calls = [];
  return {
    calls,
    current,
    back() {
      calls.push('back');
      return true;
    },
  };
}

test('el botón Atrás ignora splash y vuelve desde Créditos y Resultados', () => {
  const router = fakeRouter('splash');
  let exits = 0;
  let pauses = 0;
  const actions = { exitApp: () => { exits += 1; }, onPlayingBack: () => { pauses += 1; } };

  assert.equal(handleBackButton(router, actions), false);
  router.current = 'credits';
  assert.equal(handleBackButton(router, actions), true);
  router.current = 'results';
  assert.equal(handleBackButton(router, actions), true);

  assert.deepEqual(router.calls, ['back', 'back']);
  assert.equal(exits, 0);
  assert.equal(pauses, 0);
});

test('el botón Atrás cierra desde Home y delega en el menú de pausa al jugar', () => {
  const router = fakeRouter('home');
  let exits = 0;
  let pauses = 0;
  const actions = { exitApp: () => { exits += 1; }, onPlayingBack: () => { pauses += 1; } };

  assert.equal(handleBackButton(router, actions), true);
  router.current = 'playing';
  assert.equal(handleBackButton(router, actions), true);
  assert.equal(exits, 1);
  assert.equal(pauses, 1);
});

test('attachBackButton registra y limpia el listener de Capacitor', async () => {
  const router = fakeRouter('playing');
  const calls = [];
  const app = {
    listener: null,
    removed: 0,
    async addListener(event, listener) {
      assert.equal(event, 'backButton');
      this.listener = listener;
      return { remove: async () => { this.removed += 1; } };
    },
  };
  const detach = attachBackButton(router, {
    app,
    onPlayingBack: () => calls.push('pause'),
  });

  await Promise.resolve();
  app.listener();
  await detach();

  assert.deepEqual(calls, ['pause']);
  assert.equal(app.removed, 1);
});

test('los errores del plugin se notifican sin romper la inicialización', async () => {
  const errors = [];
  const detach = attachBackButton(fakeRouter('home'), {
    app: { addListener: async () => { throw new Error('plugin unavailable'); } },
    onError: (error) => errors.push(error.message),
  });

  await detach();

  assert.deepEqual(errors, ['plugin unavailable']);
});
