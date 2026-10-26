import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameClock, START_DELAY_MS } from '../src/core/gameClock.js';

test('no está listo hasta conocer el desfase del servidor y el instante cero', () => {
  let local = 1_000_000;
  const clock = createGameClock({ now: () => local });
  assert.equal(clock.ready, false);
  assert.equal(clock.gameTime(), null);
  assert.equal(clock.serverNow(), null);

  clock.setOffset(250);
  assert.equal(clock.ready, false);
  assert.equal(clock.serverNow(), 1_000_250);

  clock.setStartAt(1_003_250);
  assert.equal(clock.ready, true);
  assert.equal(clock.startAt, 1_003_250);
});

test('el tiempo de juego es negativo antes de startAt y cuenta desde cero después', () => {
  let local = 5_000;
  const clock = createGameClock({ now: () => local });
  clock.setOffset(0);
  clock.setStartAt(5_000 + START_DELAY_MS);

  assert.equal(clock.gameTime(), -3);
  assert.equal(clock.countdown(), 3);
  local += 1_500;
  assert.equal(clock.countdown(), 1.5);
  local += 1_500;
  assert.equal(clock.gameTime(), 0);
  local += 2_250;
  assert.equal(clock.gameTime(), 2.25);
  assert.equal(clock.countdown(), 0);
});

test('dos relojes locales desfasados coinciden si cada uno aplica su desfase', () => {
  const server = 10_000_000;
  const clockA = createGameClock({ now: () => server + 4_200 });
  const clockB = createGameClock({ now: () => server - 1_700 });
  clockA.setOffset(-4_200);
  clockB.setOffset(1_700);
  clockA.setStartAt(server - 500);
  clockB.setStartAt(server - 500);
  assert.equal(clockA.gameTime(), 0.5);
  assert.equal(clockB.gameTime(), 0.5);
});

test('ignora valores no numéricos', () => {
  const clock = createGameClock({ now: () => 0 });
  clock.setOffset(Number.NaN);
  clock.setStartAt(undefined);
  assert.equal(clock.ready, false);
  clock.setOffset(10);
  clock.setStartAt(100);
  clock.setStartAt('x');
  assert.equal(clock.ready, false);
});
