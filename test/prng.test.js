import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveSeed, mulberry32, streamFor } from '../src/core/prng.js';

const take = (random, count) => Array.from({ length: count }, random);

test('la misma semilla produce la misma secuencia en dos instancias', () => {
  assert.deepEqual(take(mulberry32(12345), 50), take(mulberry32(12345), 50));
});

test('semillas distintas producen secuencias distintas', () => {
  assert.notDeepEqual(take(mulberry32(1), 10), take(mulberry32(2), 10));
});

test('los valores quedan en [0, 1) y se reparten por todo el rango', () => {
  const values = take(mulberry32(0xdeadbeef), 5000);
  assert.ok(values.every((value) => value >= 0 && value < 1));
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  assert.ok(Math.abs(mean - 0.5) < 0.03, `media inesperada: ${mean}`);
});

test('la secuencia de referencia no cambia entre versiones', () => {
  // Fija el algoritmo: si cambia, dos clientes con versiones distintas se desincronizarían.
  assert.deepEqual(
    take(mulberry32(1), 3).map((value) => value.toFixed(6)),
    ['0.627074', '0.002736', '0.527447'],
  );
});

test('una semilla negativa o mayor de 32 bits se normaliza igual que su equivalente sin signo', () => {
  assert.deepEqual(take(mulberry32(-1), 5), take(mulberry32(0xffffffff), 5));
  assert.deepEqual(take(mulberry32(2 ** 32 + 7), 5), take(mulberry32(7), 5));
});

test('deriveSeed es determinista, devuelve enteros de 32 bits y separa las sales', () => {
  assert.equal(deriveSeed(99, 3), deriveSeed(99, 3));
  const seeds = new Set(Array.from({ length: 200 }, (_, salt) => deriveSeed(99, salt)));
  assert.equal(seeds.size, 200);
  for (const seed of seeds) {
    assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff);
  }
  assert.notEqual(deriveSeed(1, 5), deriveSeed(2, 5));
});

test('streamFor consume flujos independientes entre sí', () => {
  const a = streamFor(7, 1);
  const b = streamFor(7, 2);
  const firstA = take(a, 5);
  take(b, 100);
  assert.deepEqual(take(streamFor(7, 1), 5), firstA);
});
