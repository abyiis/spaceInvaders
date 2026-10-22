import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, formatScore, scheduleResultsNavigation } from '../src/ui/screens/results.js';

test('formatScore separa miles con punto', () => {
  assert.equal(formatScore(0), '0');
  assert.equal(formatScore(999), '999');
  assert.equal(formatScore(1000), '1.000');
  assert.equal(formatScore(1250), '1.250');
  assert.equal(formatScore(1234567), '1.234.567');
});

test('formatDuration muestra mm:ss y no limita los minutos', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(59.9), '00:59');
  assert.equal(formatDuration(60), '01:00');
  assert.equal(formatDuration(205.4), '03:25');
  assert.equal(formatDuration(4510), '75:10');
});

function fakeTimer() {
  let callback;
  let cleared = false;
  return {
    setTimeoutFn(fn, delay) {
      assert.equal(delay, 1200);
      callback = fn;
      return 1;
    },
    clearTimeoutFn(id) {
      assert.equal(id, 1);
      cleared = true;
    },
    fire() {
      callback();
    },
    get cleared() {
      return cleared;
    },
  };
}

test('muestra resultados tras 1,2 segundos solo si aún se está jugando', () => {
  const timer = fakeTimer();
  const calls = [];
  const router = {
    current: 'playing',
    show: (...args) => calls.push(args),
  };
  const result = { mode: 'solo', score: 250, wave: 2, durationSeconds: 42 };

  scheduleResultsNavigation(router, result, timer);
  assert.deepEqual(calls, []);
  timer.fire();
  assert.deepEqual(calls, [['results', { result }]]);

  const staleTimer = fakeTimer();
  router.current = 'home';
  scheduleResultsNavigation(router, result, staleTimer);
  staleTimer.fire();
  assert.equal(calls.length, 1);
});

test('cancelar impide la navegación y limpia el temporizador', () => {
  const timer = fakeTimer();
  const calls = [];
  const router = { current: 'playing', show: (...args) => calls.push(args) };
  const cancel = scheduleResultsNavigation(router, {}, timer);
  cancel();
  timer.fire();

  assert.equal(timer.cleared, true);
  assert.deepEqual(calls, []);
});
