import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShotSchedule, pickShooter } from '../src/core/shotSchedule.js';
import { Game } from '../src/game/Game.js';
import { NoopSyncGateway } from '../src/game/SyncGateway.js';

const take = (schedule, count) => Array.from({ length: count }, () => schedule.next());

test('la misma semilla y oleada producen la misma secuencia de disparos', () => {
  const a = take(createShotSchedule({ seed: 99, wave: 3, interval: 1 }), 40);
  const b = take(createShotSchedule({ seed: 99, wave: 3, interval: 1 }), 40);
  assert.deepEqual(a, b);
});

test('otra oleada o semilla cambia la secuencia', () => {
  const base = take(createShotSchedule({ seed: 99, wave: 3, interval: 1 }), 10);
  assert.notDeepEqual(base, take(createShotSchedule({ seed: 99, wave: 4, interval: 1 }), 10));
  assert.notDeepEqual(base, take(createShotSchedule({ seed: 100, wave: 3, interval: 1 }), 10));
});

test('los tiempos crecen y cada hueco queda entre 0,5 y 1,5 veces el intervalo medio', () => {
  const shots = take(createShotSchedule({ seed: 7, wave: 1, interval: 1.4 }), 200);
  let previous = 0;
  for (const { time, pick } of shots) {
    const gap = time - previous;
    assert.ok(gap >= 0.7 - 1e-9 && gap <= 2.1 + 1e-9, `hueco ${gap}`);
    assert.ok(pick >= 0 && pick < 1);
    previous = time;
  }
});

test('pickShooter respeta la rejilla y salta a los enemigos que ya no pueden disparar', () => {
  const grid = [{ id: 0, ok: true }, { id: 1, ok: false }, { id: 2, ok: false }, { id: 3, ok: true }];
  const canShoot = (enemy) => enemy.ok;
  assert.equal(pickShooter(grid, 0, canShoot).id, 0);
  assert.equal(pickShooter(grid, 0.3, canShoot).id, 3);
  assert.equal(pickShooter(grid, 0.99, canShoot).id, 3);
  assert.equal(pickShooter(grid, 0.5, () => false), null);
  assert.equal(pickShooter([], 0.5, canShoot), null);
});

class SeededCoopSync extends NoopSyncGateway {
  get isCoop() { return true; }
  get seed() { return 424242; }
  get uid() { return 'a'; }
  get remoteUid() { return 'b'; }
}

test('dos clientes coop con la misma semilla disparan las mismas balas sin intercambiar eventos', () => {
  const clients = [new Game({ sync: new SeededCoopSync() }), new Game({ sync: new SeededCoopSync() })];
  const enemyBullets = clients.map(() => []);
  clients.forEach((game, index) => {
    game.player.invulnerable = 1e9;
    game.player.fireCooldown = 1e9;
    const dt = index === 0 ? 1 / 60 : 1 / 30;
    for (let time = 0; time < 12; time += dt) {
      game.update(dt);
      for (const bullet of game.bullets) {
        if (!bullet.fromPlayer && bullet.y < 200 && !enemyBullets[index].some((seen) => seen === bullet)) {
          enemyBullets[index].push(bullet);
        }
      }
    }
  });
  const [first, second] = enemyBullets;
  assert.ok(first.length >= 5);
  assert.equal(first.length, second.length);
  first.forEach((bullet, index) => {
    assert.ok(Math.abs(bullet.x - second[index].x) < 3, `bala ${index}`);
  });
});
