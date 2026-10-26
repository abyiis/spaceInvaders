import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutStatusStack, VISUALS } from '../src/game/visuals.js';
import { Game } from '../src/game/Game.js';

const recordingCtx = () => {
  const texts = [];
  let font = '';
  const ctx = new Proxy({}, {
    get: (_t, name) => {
      if (name === 'fillText') return (text, x, y) => texts.push({ text: String(text), x, y, font });
      if (name === 'createRadialGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set: (_t, name, value) => { if (name === 'font') font = value; return true; },
  });
  return { ctx, texts };
};

test('la pila coloca cada renglón 15 px más abajo y deja la barra del jefe debajo', () => {
  const { lines, bottom, bossBarY } = layoutStatusStack([{ text: 'a' }, { text: 'b' }, { text: 'c' }]);
  assert.deepEqual(lines.map((line) => line.y), [36, 51, 66]);
  assert.equal(bottom, 81);
  assert.equal(bossBarY, 81 + VISUALS.BOSS_BAR_GAP);
  assert.equal(layoutStatusStack([]).bossBarY, 36 + VISUALS.BOSS_BAR_GAP);
});

test('con peligro, bonus, recompensa y potenciadores a la vez ningún texto comparte la misma y', () => {
  const game = new Game({ random: () => 0.5 });
  game.hazards.active = { type: 'asteroids', remaining: 5, age: 1 };
  game.bonusStage = { combo: 4, remaining: 9, ships: [] };
  game.bossRewardTimer = 2;
  Object.assign(game.player, { shieldPowerUp: 3, rapidFire: 2, tripleShot: 4, overdrive: 1 });
  const { ctx, texts } = recordingCtx();
  game.render(ctx);

  const status = texts.filter((entry) => entry.y >= VISUALS.STATUS_TOP);
  const ys = status.map((entry) => entry.y);
  assert.equal(new Set(ys).size, ys.length, `y repetidas: ${ys}`);
  assert.ok(status.length >= 7);
  for (let i = 1; i < ys.length; i += 1) {
    assert.ok(ys[i] - ys[i - 1] >= VISUALS.STATUS_LINE_HEIGHT);
  }
  const hud = texts.filter((entry) => entry.y === 12).map((entry) => entry.text);
  assert.equal(hud.length, 3);
});

test('la barra del jefe se dibuja debajo del último renglón', () => {
  const game = new Game({ random: () => 0.5 });
  game.wave = 3;
  game.formation.enemies.forEach((enemy) => { enemy.dead = true; });
  game.update(0.01);
  game.update(2.01);
  assert.ok(game.boss);
  game.player.shieldPowerUp = 3;
  game.player.rapidFire = 3;
  game.hazards.active = { type: 'magnetic', remaining: 4, age: 1 };
  const { ctx, texts } = recordingCtx();
  game.render(ctx);

  const lastLineY = Math.max(...texts.filter((entry) => entry.font.includes('ui-monospace') && entry.text.includes('s') && !entry.text.startsWith('JEFE')).map((entry) => entry.y));
  const title = texts.find((entry) => entry.text.startsWith('JEFE'));
  assert.ok(title.y > lastLineY, `título ${title.y} vs último renglón ${lastLineY}`);
});

test('«Oleada» queda a la izquierda del botón de pausa y sin pisar «Vidas»', () => {
  const game = new Game({ random: () => 0.5 });
  game.wave = 28;
  const { ctx, texts } = recordingCtx();
  game.render(ctx);
  const wave = texts.find((entry) => entry.text.startsWith('Oleada'));
  const lives = texts.find((entry) => entry.text.startsWith('Vidas'));
  assert.equal(wave.x, game.width - VISUALS.HUD_WAVE_RIGHT_MARGIN);
  assert.ok(wave.x <= game.width - 56, 'el botón ocupa x ≥ width − 56');
  // Anchos aproximados de la fuente de 14 px en negrita (~7,5 px por carácter).
  const waveLeft = wave.x - wave.text.length * 7.5;
  const livesRight = lives.x + (lives.text.length * 7.5) / 2;
  assert.ok(waveLeft > livesRight, `Oleada empieza en ${waveLeft}, Vidas termina en ${livesRight}`);
});
