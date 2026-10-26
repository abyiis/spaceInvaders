import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldTakeOverHost } from '../src/core/hostElection.js';

const connected = (value) => ({ connected: value });

test('el invitado releva al host solo cuando este figura desconectado', () => {
  const base = { hostUid: 'host', myUid: 'guest' };
  assert.equal(shouldTakeOverHost({ ...base, players: { host: connected(true), guest: connected(true) } }), false);
  assert.equal(shouldTakeOverHost({ ...base, players: { host: connected(false), guest: connected(true) } }), true);
});

test('no releva si el host no figura en la sala o si el propio jugador está desconectado', () => {
  const base = { hostUid: 'host', myUid: 'guest' };
  assert.equal(shouldTakeOverHost({ ...base, players: { guest: connected(true) } }), false);
  assert.equal(shouldTakeOverHost({ ...base, players: { host: connected(false), guest: connected(false) } }), false);
});

test('el propio host nunca se releva a sí mismo', () => {
  assert.equal(
    shouldTakeOverHost({ hostUid: 'host', myUid: 'host', players: { host: connected(false) } }),
    false,
  );
});

test('con varios candidatos releva el de menor uid', () => {
  const players = { host: connected(false), zed: connected(true), amy: connected(true), bob: connected(true) };
  const decide = (myUid) => shouldTakeOverHost({ hostUid: 'host', myUid, players });
  assert.equal(decide('amy'), true);
  assert.equal(decide('bob'), false);
  assert.equal(decide('zed'), false);
});

test('el menor uid desconectado no cuenta como candidato', () => {
  const players = { host: connected(false), amy: connected(false), bob: connected(true) };
  assert.equal(shouldTakeOverHost({ hostUid: 'host', myUid: 'bob', players }), true);
});

test('una sala terminada no cambia de host', () => {
  assert.equal(
    shouldTakeOverHost({
      hostUid: 'host',
      myUid: 'guest',
      status: 'finished',
      players: { host: connected(false), guest: connected(true) },
    }),
    false,
  );
});
