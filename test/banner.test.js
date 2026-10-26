import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bannerFrame, drawBanner, VISUALS } from '../src/game/visuals.js';
import { Game } from '../src/game/Game.js';

test('la franja entra por la izquierda, se centra y sale por la derecha', () => {
  const width = 360;
  assert.equal(bannerFrame(0, width).offsetX, -width);
  let previous = -Infinity;
  for (let p = 0; p <= 0.25; p += 0.01) {
    const { offsetX } = bannerFrame(p, width);
    assert.ok(offsetX >= previous);
    previous = offsetX;
  }
  assert.equal(bannerFrame(0.25, width).offsetX, 0);
  assert.equal(bannerFrame(0.5, width).offsetX, 0);
  assert.equal(bannerFrame(0.75, width).offsetX, 0);
  assert.equal(bannerFrame(1, width).offsetX, width);
  assert.ok(bannerFrame(0.9, width).offsetX > 0);
});

test('con movimiento reducido no se desplaza y solo hace fundido', () => {
  assert.deepEqual(bannerFrame(0, 360, true), { offsetX: 0, alpha: 0 });
  assert.deepEqual(bannerFrame(0.5, 360, true), { offsetX: 0, alpha: 1 });
  assert.equal(bannerFrame(1, 360, true).alpha, 0);
});

test('drawBanner dibuja la franja y el texto centrados verticalmente', () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_t, name) => (...args) => { calls.push([name, ...args]); },
    set: (_t, name, value) => { calls.push(['set', name, value]); return true; },
  });
  drawBanner(ctx, { text: 'OLEADA 3', kind: 'wave' }, 0.5, { width: 360, height: 640 });
  const rect = calls.find(([name]) => name === 'fillRect');
  assert.equal(rect[2], 640 / 2 - VISUALS.BANNER_HEIGHT / 2);
  const text = calls.find(([name]) => name === 'fillText');
  assert.deepEqual(text.slice(0, 2), ['fillText', 'OLEADA 3']);
  assert.equal(text[2], 180);
});

test('cada oleada nueva lanza la franja de 0,5 s y la siguiente la sustituye', () => {
  const game = new Game({ random: () => 0.5 });
  assert.equal(game.banner.text, 'OLEADA 1');
  game.formation.enemies.forEach((enemy) => { enemy.dead = true; });
  game.update(0.01);
  assert.equal(game.wave, 2);
  assert.equal(game.banner.text, 'OLEADA 2');
  assert.equal(game.banner.age, 0);

  game.update(0.3);
  assert.ok(game.banner);
  game.update(0.25);
  assert.equal(game.banner, null);
});

test('la franja no avanza en pausa', () => {
  const game = new Game({ random: () => 0.5 });
  game.pause();
  game.update(2);
  assert.ok(game.banner);
  assert.equal(game.banner.age, 0);
});

test('al iniciar una fase bonus la franja es dorada y dice FASE BONUS', () => {
  const game = new Game({ random: () => 0.5 });
  game.wave = 5;
  game.formation.enemies.forEach((enemy) => { enemy.dead = true; });
  game.update(0.01);
  assert.ok(game.bonusStage);
  assert.deepEqual({ text: game.banner.text, kind: game.banner.kind }, { text: 'FASE BONUS', kind: 'bonus' });

  const sets = [];
  const ctx = new Proxy({}, {
    get: (_t, name) => (...args) => { if (name === 'fillText') sets.push(['text', args[0]]); },
    set: (_t, name, value) => { sets.push([name, value]); return true; },
  });
  drawBanner(ctx, game.banner, 0.5, { width: 360, height: 640 });
  assert.ok(sets.some(([name, value]) => name === 'fillStyle' && value === VISUALS.BANNER_STYLES.bonus.edge));
  assert.ok(sets.some(([name, value]) => name === 'fillStyle' && value === '#ffd166'));
  assert.equal(VISUALS.BANNER_STYLES.bonus.edge, '#ffd166');
});

test('al terminar la fase bonus vuelve la franja azul de la siguiente oleada', () => {
  const game = new Game({ random: () => 0.5 });
  game.wave = 5;
  game.formation.enemies.forEach((enemy) => { enemy.dead = true; });
  game.update(0.01);
  game.bonusStage.remaining = 0;
  game.update(0.01);
  assert.equal(game.wave, 6);
  assert.deepEqual({ text: game.banner.text, kind: game.banner.kind }, { text: 'OLEADA 6', kind: 'wave' });
});

test('el invitado también ve la franja dorada cuando el host anuncia la fase bonus', () => {
  const handlers = {};
  class Sync {
    get isCoop() { return true; }
    get isHost() { return false; }
    get hostUid() { return 'host'; }
    get uid() { return 'g'; }
    get remoteUid() { return 'host'; }
    setHandlers(h) { handlers.h = h; }
    publishPlayerX() {}
    dispose() {}
  }
  const game = new Game({ sync: new Sync(), random: () => 0.5 });
  game.wave = 5;
  handlers.h.onEvent('p', { type: 'phase', uid: 'host', kind: 'bonus', wave: 5, t: 1, score: 10, lives: 3 });
  assert.equal(game.banner.kind, 'bonus');
});
