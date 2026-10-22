import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSplashController } from '../src/ui/screens/splash.js';

function fakeTimers() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeoutFn(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeoutFn(id) {
      timers.delete(id);
    },
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
  };
}

test('el splash avanza automáticamente después de 2,5 segundos', () => {
  const clock = fakeTimers();
  let completions = 0;
  createSplashController({
    onComplete: () => { completions += 1; },
    ...clock,
  });

  clock.advance(2499);
  assert.equal(completions, 0);
  clock.advance(1);
  assert.equal(completions, 1);
});

test('ignora la omisión antes de 800 ms y la acepta al alcanzar el límite', () => {
  const clock = fakeTimers();
  let completions = 0;
  const splash = createSplashController({
    onComplete: () => { completions += 1; },
    ...clock,
  });

  clock.advance(799);
  assert.equal(splash.skip(), false);
  assert.equal(completions, 0);
  clock.advance(1);
  assert.equal(splash.skip(), true);
  assert.equal(completions, 1);
});

test('solo completa una vez y cancel cancela el avance pendiente', () => {
  const clock = fakeTimers();
  let completions = 0;
  const splash = createSplashController({
    onComplete: () => { completions += 1; },
    ...clock,
  });

  clock.advance(800);
  splash.skip();
  clock.advance(2500);
  assert.equal(completions, 1);

  splash.cancel();
  clock.advance(2500);
  assert.equal(completions, 1);
});

test('cancel evita la navegación automática', () => {
  const clock = fakeTimers();
  let completions = 0;
  const splash = createSplashController({
    onComplete: () => { completions += 1; },
    ...clock,
  });

  splash.cancel();
  clock.advance(2500);
  assert.equal(completions, 0);
});
