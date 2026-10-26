import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C } from '../src/core/constants.js';
import { Game } from '../src/game/Game.js';
import { NoopSyncGateway } from '../src/game/SyncGateway.js';

class FakeCoopSync extends NoopSyncGateway {
  emitted = [];

  constructor(host) {
    super();
    this.host = host;
  }

  get isCoop() { return true; }

  get isHost() { return this.host; }

  get hostUid() { return 'host'; }

  get uid() { return this.host ? 'host' : 'guest'; }

  get remoteUid() { return this.host ? 'guest' : 'host'; }

  setHandlers(handlers) { this.handlers = handlers; }

  emitPhase(...args) { this.emitted.push(['phase', ...args]); }

  emitGameOver(...args) { this.emitted.push(['game-over', ...args]); }

  emitState(...args) { this.emitted.push(['state', ...args]); }
}

const newGame = (host) => {
  const sync = new FakeCoopSync(host);
  const game = new Game({ sync, random: () => 0.5 });
  game.player.invulnerable = 1e9;
  game.player.fireCooldown = 1e9;
  return { game, sync };
};

const clearFormation = (game) => game.formation.enemies.forEach((enemy) => { enemy.dead = true; });
const phases = (sync) => sync.emitted.filter(([type]) => type === 'phase').map(([, phase]) => phase);

test('el host decide la oleada siguiente, suma el bonus y la anuncia con el puntaje oficial', () => {
  const { game, sync } = newGame(true);
  game.elapsed = 12.5;
  clearFormation(game);
  game.update(0.01);

  assert.equal(game.wave, 2);
  assert.equal(game.score, C.WAVE_BONUS_MULTIPLIER);
  const [phase] = phases(sync);
  assert.equal(phase.kind, 'wave');
  assert.equal(phase.wave, 2);
  assert.ok(Math.abs(phase.t - 12.51) < 1e-9);
  assert.equal(phase.score, C.WAVE_BONUS_MULTIPLIER);
  assert.equal(phase.lives, 3);
  assert.ok(!phase.bossDefeated);
});

test('el invitado no avanza de oleada por su cuenta aunque no queden enemigos', () => {
  const { game, sync } = newGame(false);
  clearFormation(game);
  game.update(0.01);
  game.update(0.01);
  assert.equal(game.wave, 1);
  assert.equal(game.score, 0);
  assert.deepEqual(phases(sync), []);
});

test('el invitado arranca la oleada anunciada con el tiempo y el puntaje del host', () => {
  const { game, sync } = newGame(false);
  clearFormation(game);
  game.elapsed = 10.2;
  sync.handlers.onEvent('p1', { type: 'phase', uid: 'host', kind: 'wave', wave: 2, t: 10, score: 50, lives: 3 });

  assert.equal(game.wave, 2);
  assert.equal(game.score, 50);
  assert.equal(game.formation.wave, 2);
  assert.equal(game.formation.enemies.every((enemy) => !enemy.dead), true);
  assert.ok(Math.abs(game.formation.time - 0.2) < 1e-9);
});

test('el invitado ignora fases que no firma el host o que ya pasaron', () => {
  const { game, sync } = newGame(false);
  sync.handlers.onEvent('p1', { type: 'phase', uid: 'impostor', kind: 'wave', wave: 9, t: 1, score: 9, lives: 3 });
  assert.equal(game.wave, 1);
  sync.handlers.onEvent('p2', { type: 'phase', uid: 'host', kind: 'wave', wave: 2, t: 1, score: 60, lives: 3 });
  sync.handlers.onEvent('p3', { type: 'phase', uid: 'host', kind: 'wave', wave: 2, t: 1, score: 10, lives: 1 });
  assert.equal(game.wave, 2);
  assert.equal(game.score, 60);
  assert.equal(game.lives, 3);
});

test('tras la tercera oleada el host abre el jefe y el invitado lo recibe', () => {
  const host = newGame(true);
  host.game.wave = 3;
  clearFormation(host.game);
  host.game.update(0.01);
  assert.ok(host.game.boss);
  const [phase] = phases(host.sync);
  assert.equal(phase.kind, 'boss');
  assert.equal(phase.wave, 3);

  const guest = newGame(false);
  guest.game.wave = 3;
  clearFormation(guest.game);
  guest.sync.handlers.onEvent('p1', { type: 'phase', uid: 'host', ...phase });
  assert.ok(guest.game.boss);
  assert.equal(guest.game.boss.wave, 3);
  assert.equal(guest.game.score, phase.score);
});

test('al caer el jefe el host suma su recompensa y la siguiente fase lleva bossDefeated', () => {
  const { game, sync } = newGame(true);
  game.wave = 3;
  clearFormation(game);
  game.update(0.01);
  game.boss.health = 0;
  const livesBefore = game.lives;
  game.update(0.01);

  assert.equal(game.boss, null);
  assert.equal(game.lives, livesBefore + 1);
  const bossPhase = phases(sync).at(-1);
  assert.equal(bossPhase.kind, 'wave');
  assert.equal(bossPhase.wave, 4);
  assert.equal(bossPhase.bossDefeated, true);
  assert.equal(bossPhase.lives, livesBefore + 1);
  assert.ok(bossPhase.score >= 100);
});

test('el invitado aplica la recompensa del jefe al recibir la fase con bossDefeated', () => {
  const { game, sync } = newGame(false);
  game.wave = 3;
  clearFormation(game);
  sync.handlers.onEvent('p1', { type: 'phase', uid: 'host', kind: 'boss', wave: 3, t: 5, score: 200, lives: 3 });
  assert.ok(game.boss);

  sync.handlers.onEvent('p2', {
    type: 'phase', uid: 'host', kind: 'wave', wave: 4, t: 40, score: 400, lives: 4, bossDefeated: true,
  });
  assert.equal(game.boss, null);
  assert.equal(game.wave, 4);
  assert.equal(game.lives, 4);
  assert.equal(game.score, 400);
  assert.ok(game.bossRewardTimer > 0);
});

test('tras la quinta oleada el host abre la fase bonus y al terminar anuncia la siguiente oleada', () => {
  const { game, sync } = newGame(true);
  game.wave = 5;
  clearFormation(game);
  game.update(0.01);
  assert.ok(game.bonusStage);
  assert.equal(phases(sync)[0].kind, 'bonus');

  game.bonusStage.remaining = 0;
  game.update(0.01);
  assert.equal(game.bonusStage, null);
  assert.equal(game.wave, 6);
  assert.equal(phases(sync)[1].kind, 'wave');
});

test('el host publica el fin de partida una sola vez con el puntaje oficial', () => {
  const { game, sync } = newGame(true);
  game.score = 777;
  game.triggerGameOver();
  game.triggerGameOver();
  const gameOvers = sync.emitted.filter(([type]) => type === 'game-over');
  assert.equal(gameOvers.length, 1);
  assert.equal(gameOvers[0][2], 777);
});

test('el invitado adopta el resultado del host y no lo vuelve a publicar', () => {
  const results = [];
  const sync = new FakeCoopSync(false);
  const game = new Game({ sync, random: () => 0.5, onGameOver: (result) => results.push(result) });
  game.score = 5;
  sync.handlers.onEvent('g1', { type: 'game-over', uid: 'host', t: 80, score: 4321, wave: 7 });

  assert.equal(game.isGameOver, true);
  assert.deepEqual(results.map(({ mode, score, wave }) => [mode, score, wave]), [['coop', 4321, 7]]);
  assert.equal(sync.emitted.filter(([type]) => type === 'game-over').length, 0);
});

test('el invitado solo cierra la partida con el game-over del host', () => {
  const { game, sync } = newGame(false);
  sync.handlers.onEvent('g1', { type: 'game-over', uid: 'impostor', t: 1, score: 1, wave: 1 });
  assert.equal(game.isGameOver, false);
});

test('ambos pilotos eliminados: solo el host cierra la partida', () => {
  const host = newGame(true);
  host.game.remotePlayer.eliminated = true;
  host.game.player.hit();
  host.game.player.downedTimer = 0.01;
  host.game.update(0.02);
  assert.equal(host.game.isGameOver, true);

  const guest = newGame(false);
  guest.game.remotePlayer.eliminated = true;
  guest.game.player.hit();
  guest.game.player.downedTimer = 0.01;
  guest.game.update(0.02);
  assert.equal(guest.game.isGameOver, false);
});

test('el resultado coop trae el desglose por jugador con las bajas oficiales del host', () => {
  const results = [];
  const sync = new FakeCoopSync(false);
  Object.defineProperty(sync, 'playerNames', { get: () => ({ host: 'Ana', guest: 'Beto' }) });
  const game = new Game({ sync, random: () => 0.5, onGameOver: (result) => results.push(result) });
  game.ledger.claimKill(1, 0, 'guest', 10);
  sync.handlers.onEvent('g1', {
    type: 'game-over', uid: 'host', t: 80, score: 300, wave: 4, kills: { host: 25, guest: 5 },
  });

  assert.equal(results.length, 1);
  assert.deepEqual(results[0].players, [
    { uid: 'guest', name: 'Beto', kills: 5 },
    { uid: 'host', name: 'Ana', kills: 25 },
  ]);
  assert.equal(results[0].localUid, 'guest');
  assert.equal(results[0].isHost, false);
});

test('el resultado coop del host usa su libro de bajas y marca isHost', () => {
  const results = [];
  const sync = new FakeCoopSync(true);
  const game = new Game({ sync, random: () => 0.5, onGameOver: (result) => results.push(result) });
  game.ledger.claimKill(1, 0, 'host', 10);
  game.ledger.claimKill(1, 1, 'guest', 10);
  game.ledger.claimKill(1, 2, 'guest', 10);
  game.triggerGameOver();

  assert.equal(results[0].isHost, true);
  assert.deepEqual(results[0].players.map(({ uid, kills }) => [uid, kills]), [['host', 1], ['guest', 2]]);
  assert.deepEqual(
    sync.emitted.find(([type]) => type === 'game-over').slice(-1)[0],
    { host: 1, guest: 2 },
  );
});

test('el resultado en solitario no incluye datos de coop', () => {
  const results = [];
  const game = new Game({ random: () => 0.5, onGameOver: (result) => results.push(result) });
  game.triggerGameOver();
  assert.deepEqual(Object.keys(results[0]).sort(), ['durationSeconds', 'mode', 'score', 'wave']);
});
