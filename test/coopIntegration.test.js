import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autopilot, createClient, createFakeRoom } from './helpers/fakeRoom.js';

const FRAME_MS = 1000 / 60;
const SEED = 20261026;

function setup({ latencyMs = 60, onGameOver = {} } = {}) {
  const clock = { now: 1_000_000 };
  const room = createFakeRoom({ clock, latencyMs });
  room.setHost('host');
  const startAt = clock.now + 3000;
  const host = createClient({
    room, clock, uid: 'host', hostUid: 'host', seed: SEED, startAt, randomSeed: 1, onGameOver: onGameOver.host,
  });
  const guest = createClient({
    room, clock, uid: 'guest', hostUid: 'host', seed: SEED, startAt, randomSeed: 99, onGameOver: onGameOver.guest,
  });
  const clients = [host, guest];

  const step = ({ pilot = true } = {}) => {
    clock.now += FRAME_MS;
    room.deliver();
    for (const client of clients) {
      if (pilot) autopilot(client);
      client.game.update(1 / 60);
    }
  };
  const run = (seconds, options) => {
    const frames = Math.round(seconds * 60);
    for (let frame = 0; frame < frames; frame += 1) step(options);
  };
  return { clock, room, host, guest, clients, step, run };
}

test('ambos clientes esperan la cuenta atrás y arrancan a la vez', () => {
  const { host, guest, run } = setup();
  run(1.5);
  for (const { game } of [host, guest]) {
    assert.ok(game.countdown > 1 && game.countdown < 2, `cuenta atrás ${game.countdown}`);
    assert.equal(game.elapsed, 0);
  }
  run(1.6);
  for (const { game } of [host, guest]) {
    assert.equal(game.countdown, 0);
    assert.ok(game.elapsed > 0 && game.elapsed < 0.2);
  }
  assert.ok(Math.abs(host.game.elapsed - guest.game.elapsed) < 1e-6);
});

test('la formación y sus disparos coinciden en los dos clientes sin intercambiar eventos', () => {
  const { host, guest, run, room } = setup();
  run(3.5);
  for (const { game } of [host, guest]) game.player.fireCooldown = 1e9;
  run(6, { pilot: false });

  // Las bajas se aplican por evento con retraso: se comparan los que siguen vivos en ambos.
  // El kamikaze en picado persigue localmente a su objetivo y queda fuera.
  const survivors = host.game.formation.enemies.filter((enemy) => {
    const twin = guest.game.formation.enemies.find((candidate) => candidate.id === enemy.id);
    return !enemy.dead && !twin.dead && enemy.type !== 'kamikaze';
  });
  assert.ok(survivors.length >= 5, `solo ${survivors.length} enemigos vivos para comparar`);
  for (const enemy of survivors) {
    const twin = guest.game.formation.enemies.find((candidate) => candidate.id === enemy.id);
    assert.ok(Math.abs(enemy.x - twin.x) < 1e-6, `x del enemigo ${enemy.id}`);
    assert.ok(Math.abs(enemy.y - twin.y) < 1e-6, `y del enemigo ${enemy.id}`);
  }
  const enemyBullets = ({ game }) => game.bullets.filter((bullet) => !bullet.fromPlayer);
  assert.ok(enemyBullets(host).length > 0);
  assert.ok(Math.abs(enemyBullets(host).length - enemyBullets(guest).length) <= 1);
  assert.equal(room.sentEvents.filter((event) => event.type === 'enemy-shot').length, 0);
});

test('la nave del compañero se ve en su posición, con retraso de interpolación', () => {
  const { host, guest, run } = setup();
  run(8);
  const remote = host.game.remotePlayer;
  assert.ok(Math.abs(remote.x - guest.game.player.x) < 25, `diferencia ${Math.abs(remote.x - guest.game.player.x)}`);
});

test('las oleadas, jefes y fases bonus avanzan en sincronía y el puntaje oficial coincide', () => {
  const { host, guest, run, step } = setup();
  let reachedWave = 0;
  let worstMismatchFrames = 0;
  let mismatchFrames = 0;
  for (let frame = 0; frame < 60 * 400 && reachedWave < 7; frame += 1) {
    step();
    reachedWave = Math.max(host.game.wave, guest.game.wave);
    mismatchFrames = host.game.wave === guest.game.wave ? 0 : mismatchFrames + 1;
    worstMismatchFrames = Math.max(worstMismatchFrames, mismatchFrames);
    if (host.game.isGameOver) break;
  }
  assert.ok(reachedWave >= 7, `solo se llegó a la oleada ${reachedWave}`);
  // Un anuncio del host tarda lo que tarda el evento (60 ms) más un par de frames.
  assert.ok(worstMismatchFrames <= 12, `oleadas desfasadas ${worstMismatchFrames} frames`);

  for (const { game } of [host, guest]) game.player.fireCooldown = 1e9;
  run(3, { pilot: false });
  assert.equal(host.game.wave, guest.game.wave);
  assert.equal(host.game.lives, guest.game.lives);
  assert.ok(Math.abs(host.game.score - guest.game.score) <= 50, `${host.game.score} vs ${guest.game.score}`);
});

test('cuando el host decide el fin de partida, el compañero muestra el mismo resultado', () => {
  const results = {};
  const { host, guest, run } = setup({
    onGameOver: {
      host: (result) => { results.host = result; },
      guest: (result) => { results.guest = result; },
    },
  });
  run(10);
  host.game.score = 1234;
  host.game.triggerGameOver();
  run(1, { pilot: false });

  assert.equal(host.game.isGameOver, true);
  assert.equal(guest.game.isGameOver, true);
  assert.equal(results.host.mode, 'coop');
  assert.equal(results.guest.mode, 'coop');
  assert.equal(results.guest.score, 1234);
  assert.equal(results.guest.wave, results.host.wave);
});

test('el invitado no decide el fin de partida por su cuenta', () => {
  const { host, guest, run } = setup({ latencyMs: 5000 });
  run(6);
  guest.game.formation.enemies.forEach((enemy) => { enemy.y = guest.game.playerLineY + 40; });
  run(0.5);
  assert.equal(guest.game.isGameOver, false);
  assert.equal(host.game.isGameOver, false);
});
