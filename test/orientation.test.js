import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lockPortrait } from '../src/orientation.js';

test('lockPortrait pide la orientación vertical al plugin', async () => {
  const calls = [];
  const plugin = { lock: async (options) => { calls.push(options); } };
  assert.equal(await lockPortrait(plugin), true);
  assert.deepEqual(calls, [{ orientation: 'portrait' }]);
});

test('si el sistema rechaza el bloqueo informa del error y la app sigue funcionando', async () => {
  const errors = [];
  const plugin = { lock: async () => { throw new Error('not supported'); } };
  assert.equal(await lockPortrait(plugin, { onError: (error) => errors.push(error.message) }), false);
  assert.deepEqual(errors, ['not supported']);

  const textual = { lock: () => Promise.reject('sin permiso') };
  assert.equal(await lockPortrait(textual, { onError: (error) => errors.push(error.message) }), false);
  assert.deepEqual(errors, ['not supported', 'sin permiso']);
});

test('sin plugin (navegador de escritorio) no hace nada', async () => {
  assert.equal(await lockPortrait(undefined), false);
  assert.equal(await lockPortrait({}), false);
});
