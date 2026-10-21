import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFirebaseConfig } from '../src/net/firebaseConfigResolver.js';

test('resuelve la configuración exportada por firebaseConfig.js', () => {
  const firebaseConfig = { apiKey: 'test-key', projectId: 'test-project' };

  assert.equal(
    resolveFirebaseConfig({ './firebaseConfig.js': { firebaseConfig } }),
    firebaseConfig,
  );
});

test('indica cómo configurar Firebase cuando falta firebaseConfig.js', () => {
  assert.throws(
    () => resolveFirebaseConfig({}),
    /Create src\/net\/firebaseConfig\.js and export a firebaseConfig object/,
  );
});

test('rechaza firebaseConfig.js si no exporta un objeto firebaseConfig', () => {
  assert.throws(
    () => resolveFirebaseConfig({ './firebaseConfig.js': {} }),
    /must export a firebaseConfig object/,
  );
});
