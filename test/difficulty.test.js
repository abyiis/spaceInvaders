import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waveParams } from '../src/core/difficulty.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≉ ${expected}`);

test('oleada 1', () => {
  const p = waveParams(1);
  assert.equal(p.rows, 3);
  assert.equal(p.columns, 6);
  assert.equal(p.speed, 40);
  near(p.shootInterval, 1.4);
});

test('oleada 4', () => {
  const p = waveParams(4);
  assert.equal(p.rows, 4);
  assert.equal(p.speed, 64);
  near(p.shootInterval, 1.16);
});

test('oleada 10', () => {
  const p = waveParams(10);
  assert.equal(p.rows, 6);
  assert.equal(p.speed, 112);
  near(p.shootInterval, 0.68);
});

test('respeta los topes en oleadas muy altas', () => {
  const p = waveParams(50);
  assert.equal(p.rows, 6);
  assert.equal(p.speed, 160);
  near(p.shootInterval, 0.45);
});

test('valores menores que 1 se tratan como oleada 1', () => {
  assert.deepEqual(waveParams(0), waveParams(1));
  assert.deepEqual(waveParams(-5), waveParams(1));
});
