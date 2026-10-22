import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScreenRouter, SCREENS } from '../src/ui/screenRouter.js';
import {
  BEST_SCORE_STORAGE_KEY,
  RESULTS_DELAY_MS,
  SCREEN_FADE_MS,
  SPLASH_DURATION_MS,
  SPLASH_SKIP_AFTER_MS,
} from '../src/ui/uiConstants.js';

const container = {};

test('show monta la pantalla con params y desmonta la anterior en orden', () => {
  const calls = [];
  const screens = {
    home: (element, params, nav) => {
      calls.push(['mount-home', element, params, nav]);
      return () => calls.push(['unmount-home']);
    },
    credits: (element, params, nav) => {
      calls.push(['mount-credits', element, params, nav]);
      return () => calls.push(['unmount-credits']);
    },
  };
  const router = createScreenRouter({ container, screens });
  const params = { source: 'home' };

  router.show('home');
  assert.equal(router.current, 'home');
  router.show('credits', params);

  assert.equal(router.current, 'credits');
  assert.deepEqual(calls, [
    ['mount-home', container, {}, router],
    ['unmount-home'],
    ['mount-credits', container, params, router],
  ]);
});

test('un nombre desconocido falla sin desmontar la pantalla actual', () => {
  let unmounts = 0;
  const router = createScreenRouter({
    container,
    screens: {
      home: () => () => { unmounts += 1; },
    },
  });
  router.show('home');

  assert.throws(() => router.show('missing'), /Unknown screen: missing/);
  assert.equal(router.current, 'home');
  assert.equal(unmounts, 0);
});

test('back navega al destino predeterminado y devuelve false sin destino', () => {
  const calls = [];
  const router = createScreenRouter({
    container,
    screens: {
      home: () => {
        calls.push('home');
        return () => calls.push('unmount-home');
      },
      credits: () => {
        calls.push('credits');
        return () => calls.push('unmount-credits');
      },
    },
  });

  router.show('credits');
  assert.equal(router.back(), true);
  assert.equal(router.current, 'home');
  assert.deepEqual(calls, ['credits', 'unmount-credits', 'home']);
  assert.equal(router.back(), false);
});

test('back usa destinos personalizados', () => {
  const router = createScreenRouter({
    container,
    screens: {
      home: () => () => {},
      lobby: () => () => {},
    },
    backTargets: { lobby: 'home' },
  });

  router.show('lobby');
  assert.equal(router.back(), true);
  assert.equal(router.current, 'home');
});

test('destroy desmonta la pantalla actual y limpia current', () => {
  let unmounts = 0;
  const router = createScreenRouter({
    container,
    screens: {
      home: () => () => { unmounts += 1; },
    },
  });

  router.show('home');
  router.destroy();
  router.destroy();

  assert.equal(unmounts, 1);
  assert.equal(router.current, null);
});

test('los fallos al montar se propagan y no dejan current obsoleto', () => {
  const failure = new Error('mount failed');
  const router = createScreenRouter({
    container,
    screens: {
      home: () => () => {},
      credits: () => { throw failure; },
    },
  });
  router.show('home');

  assert.throws(() => router.show('credits'), (error) => error === failure);
  assert.equal(router.current, null);
});

test('SCREENS y uiConstants exponen los valores definidos por la especificación', () => {
  assert.deepEqual(SCREENS, {
    SPLASH: 'splash',
    HOME: 'home',
    CREDITS: 'credits',
    PLAYING: 'playing',
    RESULTS: 'results',
  });
  assert.equal(SPLASH_DURATION_MS, 2500);
  assert.equal(SPLASH_SKIP_AFTER_MS, 800);
  assert.equal(RESULTS_DELAY_MS, 1200);
  assert.equal(SCREEN_FADE_MS, 200);
  assert.equal(BEST_SCORE_STORAGE_KEY, 'spacecoop.bestScore');
});
