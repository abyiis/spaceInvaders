import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBestScoreStore } from '../src/ui/bestScore.js';
import { BEST_SCORE_STORAGE_KEY } from '../src/ui/uiConstants.js';

function memoryStorage(initial = null) {
  let value = initial;
  return {
    getItem(key) {
      assert.equal(key, BEST_SCORE_STORAGE_KEY);
      return value;
    },
    setItem(key, next) {
      assert.equal(key, BEST_SCORE_STORAGE_KEY);
      value = next;
    },
  };
}

test('sin récord devuelve null y el primer puntaje se convierte en récord', () => {
  const store = createBestScoreStore({ storage: memoryStorage() });

  assert.equal(store.get(), null);
  assert.deepEqual(store.submit(120), { best: 120, isNewBest: true });
  assert.equal(store.get(), 120);
});

test('solo marca récord cuando supera el puntaje anterior', () => {
  const store = createBestScoreStore({ storage: memoryStorage('120') });

  assert.deepEqual(store.submit(120), { best: 120, isNewBest: false });
  assert.deepEqual(store.submit(80), { best: 120, isNewBest: false });
  assert.deepEqual(store.submit(121), { best: 121, isNewBest: true });
  assert.equal(store.get(), 121);
});

test('storage ausente o que lanza se ignora sin mostrar un récord', () => {
  const unavailable = createBestScoreStore({ storage: null });
  assert.equal(unavailable.get(), null);
  assert.deepEqual(unavailable.submit(10), { best: null, isNewBest: false });

  const throwing = createBestScoreStore({
    storage: {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
    },
  });
  assert.equal(throwing.get(), null);
  assert.deepEqual(throwing.submit(10), { best: null, isNewBest: false });
});

test('ignora valores almacenados que no son puntajes válidos', () => {
  const store = createBestScoreStore({ storage: memoryStorage('-4') });

  assert.equal(store.get(), null);
  assert.deepEqual(store.submit(0), { best: 0, isNewBest: true });
});

test('rechaza puntajes inválidos', () => {
  const store = createBestScoreStore({ storage: memoryStorage() });

  assert.throws(() => store.submit(-1), /non-negative safe integer/);
  assert.throws(() => store.submit(1.5), /non-negative safe integer/);
});
