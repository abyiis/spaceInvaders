import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CREDITS } from '../src/ui/creditsData.js';

test('CREDITS incluye al menos un integrante con nombre no vacío', () => {
  assert.ok(Array.isArray(CREDITS.team));
  assert.ok(CREDITS.team.length > 0);
  for (const member of CREDITS.team) {
    assert.equal(typeof member.name, 'string');
    assert.ok(member.name.trim().length > 0);
  }
});

test('los créditos contienen los tres nombres entregados por el equipo', () => {
  assert.deepEqual(CREDITS.team.map(({ name }) => name), [
    'Juan Felipe Cano Noreña',
    'Juan David Parra Sierra',
    'Santiago Viana Ayala',
  ]);
});
