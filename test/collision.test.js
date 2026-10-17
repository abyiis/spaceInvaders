import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxesOverlap } from '../src/core/collision.js';

const box = (x, y, w = 10, h = 10) => ({ x, y, w, h });

test('cajas superpuestas colisionan', () => {
  assert.equal(boxesOverlap(box(0, 0), box(5, 5)), true);
});

test('cajas separadas no colisionan', () => {
  assert.equal(boxesOverlap(box(0, 0), box(20, 0)), false);
  assert.equal(boxesOverlap(box(0, 0), box(0, 20)), false);
});

test('bordes que solo se tocan no cuentan', () => {
  assert.equal(boxesOverlap(box(0, 0), box(10, 0)), false);
});

test('es simétrica y soporta tamaños distintos', () => {
  const a = box(0, 0, 4, 12);
  const b = box(10, 0, 28, 20);
  assert.equal(boxesOverlap(a, b), boxesOverlap(b, a));
  assert.equal(boxesOverlap(box(0, 0, 4, 12), box(13, 0, 28, 20)), true);
});
