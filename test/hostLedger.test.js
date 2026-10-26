import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHostLedger } from '../src/core/hostLedger.js';

test('el primer reclamo de una baja gana y los duplicados no suman', () => {
  const ledger = createHostLedger();
  assert.equal(ledger.claimKill(1, 4, 'ana', 10), true);
  assert.equal(ledger.claimKill(1, 4, 'beto', 10), false);
  assert.equal(ledger.claimKill(1, 4, 'ana', 10), false);
  assert.deepEqual(ledger.killsBy(), { ana: 1 });
  assert.deepEqual(ledger.pointsBy(), { ana: 10 });
  assert.equal(ledger.hasKill(1, 4), true);
  assert.equal(ledger.hasKill(1, 5), false);
});

test('el mismo id en otra oleada es otro enemigo', () => {
  const ledger = createHostLedger();
  assert.equal(ledger.claimKill(1, 0, 'ana', 10), true);
  assert.equal(ledger.claimKill(2, 0, 'beto', 10), true);
  assert.deepEqual(ledger.killsBy(), { ana: 1, beto: 1 });
});

test('las naves bonus tienen su propio espacio de ids y suman los puntos del combo', () => {
  const ledger = createHostLedger();
  assert.equal(ledger.claimKill(5, 3, 'ana', 10), true);
  assert.equal(ledger.claimBonusKill(5, 3, 'beto', 150), true);
  assert.equal(ledger.claimBonusKill(5, 3, 'ana', 50), false);
  assert.deepEqual(ledger.pointsBy(), { ana: 10, beto: 150 });
});

test('con dos jugadores reclamando la misma baja a la vez solo suma una vez, gane quien gane', () => {
  const ledger = createHostLedger();
  const claims = [['ana', 10], ['beto', 10], ['ana', 10], ['beto', 10]];
  const winners = claims.filter(([uid, points]) => ledger.claimKill(2, 7, uid, points));
  assert.equal(winners.length, 1);
  const totalPoints = Object.values(ledger.pointsBy()).reduce((sum, value) => sum + value, 0);
  assert.equal(totalPoints, 10);
});

test('markDrop evita crear dos veces el mismo potenciador', () => {
  const ledger = createHostLedger();
  assert.equal(ledger.markDrop('k:2:7'), true);
  assert.equal(ledger.markDrop('k:2:7'), false);
});

test('startWave olvida los reclamos antiguos pero conserva los totales', () => {
  const ledger = createHostLedger();
  ledger.claimKill(1, 0, 'ana', 10);
  ledger.claimKill(2, 0, 'ana', 10);
  ledger.markDrop('k:1:0');
  ledger.startWave(2);
  assert.equal(ledger.hasKill(1, 0), false);
  assert.equal(ledger.hasKill(2, 0), true);
  assert.equal(ledger.markDrop('k:1:0'), true);
  assert.deepEqual(ledger.killsBy(), { ana: 2 });
});

test('reset deja el libro vacío', () => {
  const ledger = createHostLedger();
  ledger.claimKill(1, 0, 'ana', 10);
  ledger.reset();
  assert.deepEqual(ledger.killsBy(), {});
  assert.equal(ledger.claimKill(1, 0, 'beto', 10), true);
});
