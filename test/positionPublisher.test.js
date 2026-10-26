import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPositionPublisher } from '../src/core/positionPublisher.js';
import { CoopGateway } from '../src/game/CoopGateway.js';

const setup = () => {
  let time = 1_000;
  const published = [];
  const publisher = createPositionPublisher({
    publish: (x) => published.push([time, x]),
    now: () => time,
  });
  return { publisher, published, advance: (ms) => { time += ms; } };
};

test('publica la primera posición y luego solo cada 100 ms', () => {
  const { publisher, published, advance } = setup();
  assert.equal(publisher.update(0.5), true);
  advance(16);
  assert.equal(publisher.update(0.6), false);
  advance(60);
  assert.equal(publisher.update(0.7), false);
  advance(30);
  assert.equal(publisher.update(0.7), true);
  assert.deepEqual(published.map(([, x]) => x), [0.5, 0.7]);
});

test('no publica si la posición cambió 0,002 o menos', () => {
  const { publisher, published, advance } = setup();
  publisher.update(0.5);
  advance(150);
  assert.equal(publisher.update(0.5019), false);
  advance(150);
  assert.equal(publisher.update(0.5021), true);
  advance(150);
  assert.equal(publisher.update(0.5021), false);
  assert.equal(published.length, 2);
});

test('compara con la última posición publicada, no con la última recibida', () => {
  const { publisher, advance } = setup();
  publisher.update(0.5);
  advance(100);
  assert.equal(publisher.update(0.5015), false);
  advance(100);
  // 0,003 frente a lo publicado: un deslizamiento lento acaba publicándose.
  assert.equal(publisher.update(0.503), true);
});

test('ignora valores no numéricos y reset permite volver a publicar', () => {
  const { publisher, published } = setup();
  assert.equal(publisher.update(Number.NaN), false);
  assert.equal(publisher.update(0.3), true);
  assert.equal(publisher.update(0.3), false);
  publisher.reset();
  assert.equal(publisher.update(0.3), true);
  assert.equal(published.length, 2);
});

test('CoopGateway publica la posición con el publicador y reporta errores de red', async () => {
  let time = 0;
  const calls = [];
  const errors = [];
  const repository = {
    watchPlayers: () => () => {},
    watchGameEvents: () => () => {},
    watchPresence: () => async () => {},
    publishPlayerX: async (code, x) => {
      calls.push([code, x]);
      if (x > 0.9) throw new Error('offline');
    },
    emitGameEvent: async () => {},
  };
  const gateway = new CoopGateway({
    roomRepository: repository,
    code: 'ABCDE',
    uid: 'a',
    hostUid: 'a',
    now: () => time,
    onError: (error) => errors.push(error.message),
  });
  gateway.publishPlayerX(0.4);
  time += 50;
  gateway.publishPlayerX(0.6);
  time += 60;
  gateway.publishPlayerX(0.6);
  time += 100;
  gateway.publishPlayerX(0.95);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [['ABCDE', 0.4], ['ABCDE', 0.6], ['ABCDE', 0.95]]);
  assert.deepEqual(errors, ['offline']);
  gateway.dispose();
});
