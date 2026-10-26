import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInterpolationBuffer } from '../src/core/interpolationBuffer.js';
import { CoopGateway } from '../src/game/CoopGateway.js';

test('sin muestras no hay posición', () => {
  const buffer = createInterpolationBuffer();
  assert.equal(buffer.sample(1_000), null);
  assert.equal(buffer.latest(), null);
});

test('interpola entre las dos muestras que rodean al instante retrasado 100 ms', () => {
  const buffer = createInterpolationBuffer({ delayMs: 100 });
  buffer.push(1_000, 0.2);
  buffer.push(1_100, 0.4);
  buffer.push(1_200, 0.8);
  assert.ok(Math.abs(buffer.sample(1_150) - 0.3) < 1e-9);
  assert.ok(Math.abs(buffer.sample(1_250) - 0.6) < 1e-9);
  assert.equal(buffer.sample(1_200), 0.4);
});

test('antes de la primera muestra o después de la última mantiene la más cercana', () => {
  const buffer = createInterpolationBuffer();
  buffer.push(1_000, 0.2);
  buffer.push(1_100, 0.4);
  assert.equal(buffer.sample(900), 0.2);
  assert.equal(buffer.sample(5_000), 0.4);
  assert.equal(buffer.latest(), 0.4);
});

test('descarta muestras repetidas, antiguas o inválidas', () => {
  const buffer = createInterpolationBuffer();
  assert.equal(buffer.push(1_000, 0.2), true);
  assert.equal(buffer.push(1_000, 0.9), false);
  assert.equal(buffer.push(900, 0.9), false);
  assert.equal(buffer.push(Number.NaN, 0.9), false);
  assert.equal(buffer.push(1_100, undefined), false);
  assert.equal(buffer.size, 1);
});

test('conserva solo las últimas muestras', () => {
  const buffer = createInterpolationBuffer({ maxSamples: 3 });
  for (let i = 0; i < 10; i += 1) buffer.push(1_000 + i * 100, i / 10);
  assert.equal(buffer.size, 3);
  assert.equal(buffer.sample(0), 0.7);
});

test('el movimiento interpolado es continuo aunque lleguen muestras a 10 Hz', () => {
  const buffer = createInterpolationBuffer();
  for (let i = 0; i <= 20; i += 1) buffer.push(1_000 + i * 100, i * 0.04);
  let previous = buffer.sample(1_100);
  for (let now = 1_101; now < 3_000; now += 1) {
    const x = buffer.sample(now);
    assert.ok(Math.abs(x - previous) <= 0.0004 + 1e-9, `salto en ${now}`);
    previous = x;
  }
});

const createRepository = () => {
  const handlers = {};
  return {
    handlers,
    watchServerOffset: (onOffset) => { handlers.offset = onOffset; return () => {}; },
    watchPlayers: (_code, callback) => { handlers.players = callback; return () => {}; },
    watchGameEvents: () => () => {},
    watchPresence: () => async () => {},
  };
};

test('CoopGateway dibuja al compañero 100 ms atrás según el reloj del servidor', () => {
  let localNow = 5_000;
  const repository = createRepository();
  const gateway = new CoopGateway({
    roomRepository: repository,
    code: 'ABCDE',
    uid: 'a',
    hostUid: 'a',
    now: () => localNow,
  });
  repository.handlers.offset(1_000);
  assert.equal(gateway.remoteX, null);
  repository.handlers.players({ a: { x: 0.1 }, b: { x: 0.2, ts: 6_000 } });
  repository.handlers.players({ a: { x: 0.1 }, b: { x: 0.6, ts: 6_100 } });
  // serverNow = 5_000 + 1_000 = 6_000: se renderiza en 5_900, antes de la primera muestra.
  assert.equal(gateway.remoteX, 0.2);
  localNow = 5_150;
  assert.ok(Math.abs(gateway.remoteX - 0.4) < 1e-9);
  localNow = 5_400;
  assert.equal(gateway.remoteX, 0.6);
  gateway.dispose();
});

test('CoopGateway usa la última posición si todavía no conoce el reloj del servidor', () => {
  const repository = createRepository();
  const gateway = new CoopGateway({ roomRepository: repository, code: 'ABCDE', uid: 'a', hostUid: 'a' });
  repository.handlers.players({ a: { x: 0.1 }, b: { x: 0.9, ts: 123 } });
  assert.equal(gateway.remoteX, 0.9);
  repository.handlers.players({ a: { x: 0.1 }, b: { x: 0.5 } });
  assert.equal(gateway.remoteX, 0.5);
  gateway.dispose();
});
