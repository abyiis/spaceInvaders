import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C } from '../src/core/constants.js';
import { Game } from '../src/game/Game.js';
import { Bullet } from '../src/game/Bullet.js';
import { NoopSyncGateway } from '../src/game/SyncGateway.js';

/** Gateway falso que registra cada llamada como `[método, ...argumentos]`. */
function recordingGateway() {
  const calls = [];
  const record = (name) => (...args) => calls.push([name, ...args]);
  return {
    calls,
    isCoop: true,
    publishPlayerX: record('publishPlayerX'),
    emitShot: record('emitShot'),
    emitKill: record('emitKill'),
    emitHit: record('emitHit'),
    dispose: record('dispose'),
    named: (name) => calls.filter((c) => c[0] === name),
  };
}

const constantRandom = () => 0.5;

test('NoopSyncGateway no es coop y acepta todas las llamadas sin error', () => {
  const s = new NoopSyncGateway();
  assert.equal(s.isCoop, false);
  assert.doesNotThrow(() => {
    s.publishPlayerX(0.5);
    s.emitShot(1, 0.5);
    s.emitKill(1, 0, 1);
    s.emitHit(1);
    s.dispose();
  });
});

test('por defecto Game usa NoopSyncGateway y funciona sin red', () => {
  const g = new Game({ random: constantRandom });
  assert.ok(g.sync instanceof NoopSyncGateway);
  assert.doesNotThrow(() => {
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    g.dispose();
  });
});

test('Game usa el gateway inyectado', () => {
  const sync = recordingGateway();
  const g = new Game({ random: constantRandom, sync });
  assert.equal(g.sync, sync);
});

test('cada update publica la posición normalizada de la nave', () => {
  const sync = recordingGateway();
  const g = new Game({ random: constantRandom, sync });
  g.player.x = g.width / 4;

  g.update(0.001);

  const [call] = sync.named('publishPlayerX');
  assert.ok(Math.abs(call[1] - 0.25) < 1e-9);
});

test('el disparo del jugador se notifica con tiempo de juego y x normalizada', () => {
  const sync = recordingGateway();
  const g = new Game({ random: constantRandom, sync });

  g.update(0.1);

  const shots = sync.named('emitShot');
  assert.equal(shots.length, 1);
  assert.ok(Math.abs(shots[0][1] - 0.1) < 1e-9);
  assert.ok(Math.abs(shots[0][2] - 0.5) < 1e-9);
});

test('destruir un enemigo emite kill con oleada e id; un impacto que no destruye no emite', () => {
  const sync = recordingGateway();
  const g = new Game({ random: constantRandom, sync });
  g.player.fireCooldown = 1e9;
  const enemy = g.formation.enemies[7];
  enemy.hp = 2;
  const fire = () =>
    g.bullets.push(new Bullet({ x: enemy.x, y: enemy.y, fromPlayer: true, vy: -C.PLAYER_BULLET_SPEED }));

  fire();
  g.update(0.001);
  assert.equal(sync.named('emitKill').length, 0);

  fire();
  g.update(0.001);
  const kills = sync.named('emitKill');
  assert.equal(kills.length, 1);
  assert.equal(kills[0][1], 1, 'oleada');
  assert.equal(kills[0][2], 7, 'enemyId');
  assert.ok(kills[0][3] > 0, 'tiempo de juego');
});

test('perder una vida emite hit; el golpe durante la invulnerabilidad no', () => {
  const sync = recordingGateway();
  const g = new Game({ random: constantRandom, sync });
  g.player.fireCooldown = 1e9;
  const shoot = () =>
    g.bullets.push(new Bullet({ x: g.player.x, y: g.player.y, fromPlayer: false, vy: C.ENEMY_BULLET_SPEED }));

  shoot();
  g.update(0.001);
  shoot();
  g.update(0.001);

  assert.equal(sync.named('emitHit').length, 1);
});

test('los ids de enemigo son únicos y consecutivos dentro de la oleada', () => {
  const g = new Game({ random: constantRandom });
  const ids = g.formation.enemies.map((e) => e.id);
  assert.deepEqual(ids, ids.map((_, i) => i));
});

test('elapsed acumula dt, se detiene en game over y se reinicia con startNewGame', () => {
  const g = new Game({ random: constantRandom });
  g.player.invulnerable = 1e9;
  g.update(0.25);
  g.update(0.25);
  assert.ok(Math.abs(g.elapsed - 0.5) < 1e-9);

  g.isGameOver = true;
  g.update(1);
  assert.ok(Math.abs(g.elapsed - 0.5) < 1e-9);

  g.startNewGame();
  assert.equal(g.elapsed, 0);
});

test('dispose delega en el gateway', () => {
  const sync = recordingGateway();
  const g = new Game({ random: constantRandom, sync });
  g.dispose();
  assert.equal(sync.named('dispose').length, 1);
});