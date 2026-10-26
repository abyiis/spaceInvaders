import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/Game.js';
import { NoopSyncGateway } from '../src/game/SyncGateway.js';

class ClockedCoopSync extends NoopSyncGateway {
  time = null;

  get isCoop() {
    return true;
  }

  get uid() {
    return 'a';
  }

  get remoteUid() {
    return 'b';
  }

  gameTime() {
    return this.time;
  }
}

const newGame = (time) => {
  const sync = new ClockedCoopSync();
  sync.time = time;
  const game = new Game({ sync, random: () => 0.5, hazardsRandom: () => 0.5 });
  return { game, sync };
};

test('sin reloj sincronizado la partida coop espera sin avanzar', () => {
  const { game } = newGame(null);
  game.update(1 / 60);
  assert.equal(game.syncingClock, true);
  assert.equal(game.elapsed, 0);
});

test('durante la cuenta atrás la simulación no avanza y se informa el tiempo restante', () => {
  const { game } = newGame(-2.4);
  const before = game.formation.enemies.map((enemy) => enemy.x);
  game.update(0.05);
  assert.equal(game.syncingClock, false);
  assert.ok(Math.abs(game.countdown - 2.4) < 1e-9);
  assert.equal(game.elapsed, 0);
  assert.deepEqual(game.formation.enemies.map((enemy) => enemy.x), before);
});

test('al llegar startAt el juego avanza hasta el tiempo del servidor en pasos fijos', () => {
  const { game, sync } = newGame(0);
  sync.time = 0.5;
  game.update(0.001);
  assert.equal(game.countdown, 0);
  assert.ok(Math.abs(game.elapsed - 0.5) < 1e-5);

  sync.time = 0.5 + 1 / 60;
  game.update(0.2);
  assert.ok(Math.abs(game.elapsed - sync.time) < 1e-5);
});

test('ignora el dt del frame: el tiempo de juego sale del reloj, no de la tasa de refresco', () => {
  const first = newGame(0);
  const second = newGame(0);
  for (const [game, sync, frame] of [[first.game, first.sync, 1 / 30], [second.game, second.sync, 1 / 144]]) {
    for (let time = frame; time <= 3; time += frame) {
      sync.time = time;
      game.update(frame);
    }
    sync.time = 3;
    game.update(frame);
  }
  assert.ok(Math.abs(first.game.elapsed - 3) < 1e-5);
  assert.ok(Math.abs(second.game.elapsed - 3) < 1e-5);
});

test('un retraso grande se recupera en varios frames sin pasar del tope por frame', () => {
  const { game, sync } = newGame(0);
  sync.time = 10;
  game.update(0.016);
  assert.ok(game.elapsed > 0 && game.elapsed < 10);
  const afterOne = game.elapsed;
  for (let frame = 0; frame < 20; frame += 1) game.update(0.016);
  assert.ok(game.elapsed > afterOne);
  assert.ok(game.elapsed <= 10 + 1e-5);
});

test('tras el Game Over la simulación deja de seguir al reloj', () => {
  const { game, sync } = newGame(1);
  game.update(0.016);
  game.triggerGameOver();
  const elapsed = game.elapsed;
  sync.time = 5;
  game.update(0.016);
  assert.equal(game.elapsed, elapsed);
});
