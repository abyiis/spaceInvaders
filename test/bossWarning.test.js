import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawBossWarning, VISUALS } from '../src/game/visuals.js';
import { Game } from '../src/game/Game.js';
import { NoopSyncGateway } from '../src/game/SyncGateway.js';

const readyForBoss = (game) => {
  game.wave = 3;
  game.formation.enemies.forEach((enemy) => { enemy.dead = true; });
  game.player.invulnerable = 1e9;
  game.player.fireCooldown = 1e9;
};

test('el jefe llega tras 2 s de advertencia, no al instante', () => {
  const game = new Game({ random: () => 0.5 });
  readyForBoss(game);
  game.update(0.01);
  assert.equal(game.boss, null);
  assert.equal(game.bossIncoming.wave, 3);

  game.update(1.9);
  assert.equal(game.boss, null);
  assert.ok(game.bossIncoming);
  game.update(0.2);
  assert.ok(game.boss);
  assert.equal(game.bossIncoming, null);
  assert.equal(game.boss.wave, 3);
});

test('durante la advertencia la partida no avanza de oleada ni repite la transición', () => {
  const game = new Game({ random: () => 0.5 });
  readyForBoss(game);
  const scoreAfterBonus = (() => { game.update(0.01); return game.score; })();
  for (let i = 0; i < 60; i += 1) game.update(1 / 60);
  assert.equal(game.wave, 3);
  assert.equal(game.score, scoreAfterBonus);
});

test('la advertencia dibuja un triángulo y el texto; el parpadeo la oculta a ratos', () => {
  const draw = (age, reducedMotion = false) => {
    const calls = [];
    const ctx = new Proxy({}, {
      get: (_t, name) => (...args) => { calls.push([name, ...args]); },
      set: () => true,
    });
    drawBossWarning(ctx, age, { width: 360, height: 640, reducedMotion });
    return calls;
  };
  const visible = draw(0.01);
  assert.ok(visible.some(([name, text]) => name === 'fillText' && text === '¡ALERTA! JEFE'));
  const hidden = draw(1 / (VISUALS.BOSS_WARNING_BLINK_HZ * 2) + 0.01);
  assert.equal(hidden.some(([name]) => name === 'fillText'), false);
  const steady = draw(1 / (VISUALS.BOSS_WARNING_BLINK_HZ * 2) + 0.01, true);
  assert.ok(steady.some(([name]) => name === 'fillText'));
});

class FakeCoopSync extends NoopSyncGateway {
  emitted = [];

  constructor(host) { super(); this.host = host; }

  get isCoop() { return true; }

  get isHost() { return this.host; }

  get uid() { return this.host ? 'host' : 'guest'; }

  get remoteUid() { return this.host ? 'guest' : 'host'; }

  setHandlers(handlers) { this.handlers = handlers; }

  emitPhase(phase) { this.emitted.push(phase); }
}

test('coop: el host anuncia la fase al empezar la advertencia y el invitado cuenta sus propios 2 s', () => {
  const hostSync = new FakeCoopSync(true);
  const host = new Game({ sync: hostSync, random: () => 0.5 });
  readyForBoss(host);
  host.update(0.01);
  assert.equal(hostSync.emitted.length, 1);
  assert.equal(hostSync.emitted[0].kind, 'boss');
  assert.ok(host.bossIncoming);
  assert.equal(host.boss, null);

  const guestSync = new FakeCoopSync(false);
  const guest = new Game({ sync: guestSync, random: () => 0.5 });
  guest.wave = 3;
  guest.elapsed = hostSync.emitted[0].t + 0.5;
  guestSync.handlers.onEvent('p', { type: 'phase', uid: 'host', ...hostSync.emitted[0] });
  assert.ok(guest.bossIncoming);
  // El retraso del evento se descuenta con el tope de 0,25 s.
  assert.ok(Math.abs(guest.bossIncoming.age - 0.25) < 1e-9);
  guest.update(1.7);
  assert.equal(guest.boss, null);
  guest.update(0.1);
  assert.ok(guest.boss);
});

test('una fase de oleada posterior cancela la advertencia pendiente del invitado', () => {
  const sync = new FakeCoopSync(false);
  const guest = new Game({ sync, random: () => 0.5 });
  guest.wave = 3;
  sync.handlers.onEvent('p1', { type: 'phase', uid: 'host', kind: 'boss', wave: 3, t: 5, score: 0, lives: 3 });
  assert.ok(guest.bossIncoming);
  sync.handlers.onEvent('p2', { type: 'phase', uid: 'host', kind: 'wave', wave: 4, t: 6, score: 0, lives: 3 });
  assert.equal(guest.bossIncoming, null);
  assert.equal(guest.wave, 4);
});
