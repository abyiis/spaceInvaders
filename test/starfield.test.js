import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C } from '../src/core/constants.js';
import { Game } from '../src/game/Game.js';
import { Starfield } from '../src/game/Starfield.js';

/** Generador determinista simple (LCG) para pruebas. */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const totalStars = C.STAR_LAYERS.reduce((sum, l) => sum + l.count, 0);

test('Starfield crea las estrellas de cada capa dentro del lienzo', () => {
  const sf = new Starfield({ random: seeded(7) });

  assert.equal(sf.stars.length, totalStars);
  C.STAR_LAYERS.forEach((layer, index) => {
    assert.equal(sf.stars.filter((s) => s.layer === index).length, layer.count);
  });
  for (const s of sf.stars) {
    assert.ok(s.x >= 0 && s.x < C.WIDTH);
    assert.ok(s.y >= 0 && s.y < C.HEIGHT);
  }
});

test('Starfield: parallax, cada capa baja a su velocidad y la x no cambia', () => {
  const sf = new Starfield({ random: seeded(3) });
  // Estrellas arriba del todo para que ninguna dé la vuelta en este paso.
  for (const s of sf.stars) s.y = 100;
  const before = sf.stars.map((s) => ({ ...s }));

  sf.update(0.5);

  sf.stars.forEach((s, i) => {
    const speed = C.STAR_LAYERS[s.layer].speed;
    assert.ok(Math.abs(s.y - (before[i].y + speed * 0.5)) < 1e-9);
    assert.equal(s.x, before[i].x);
  });
  const speeds = C.STAR_LAYERS.map((l) => l.speed);
  assert.deepEqual([...speeds].sort((a, b) => a - b), speeds, 'de lejana a cercana, cada vez más rápida');
});

test('Starfield: al salir por abajo reaparece arriba con una x nueva', () => {
  const sf = new Starfield({ random: seeded(5) });
  const star = sf.stars[0];
  const speed = C.STAR_LAYERS[star.layer].speed;
  star.y = C.HEIGHT - 1;
  star.x = -1; // valor imposible para detectar que se reasignó

  sf.update(2 / speed); // avanza 2 px: se pasa 1 px del borde

  assert.ok(star.y >= 0 && star.y < 2, `y=${star.y}`);
  assert.ok(star.x >= 0 && star.x < C.WIDTH);
});

test('Starfield: tras mucho tiempo todas las estrellas siguen dentro del lienzo', () => {
  const sf = new Starfield({ random: seeded(11) });

  for (let i = 0; i < 6000; i++) sf.update(1 / 60);

  assert.equal(sf.stars.length, totalStars);
  for (const s of sf.stars) {
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y));
    assert.ok(s.x >= 0 && s.x < C.WIDTH);
    assert.ok(s.y >= 0 && s.y < C.HEIGHT);
  }
});

test('Starfield: la misma semilla produce el mismo fondo', () => {
  const a = new Starfield({ random: seeded(42) });
  const b = new Starfield({ random: seeded(42) });
  for (let i = 0; i < 300; i++) {
    a.update(1 / 60);
    b.update(1 / 60);
  }
  assert.deepEqual(a.stars, b.stars);
});

test('Starfield.render dibuja cada estrella con el tamaño y la opacidad de su capa', () => {
  const sf = new Starfield({ random: seeded(2) });
  const rects = [];
  const styles = [];
  const ctx = {
    set fillStyle(v) {
      styles.push(v);
    },
    fillRect: (x, y, w, h) => rects.push({ w, h }),
  };

  sf.render(ctx);

  assert.equal(rects.length, totalStars);
  assert.deepEqual(
    styles,
    C.STAR_LAYERS.map((l) => `rgba(255, 255, 255, ${l.alpha})`),
  );
  const sizes = rects.map((r) => r.w);
  const expected = C.STAR_LAYERS.flatMap((l) => Array(l.count).fill(l.size));
  assert.deepEqual(sizes, expected);
});

test('Game: el fondo se mueve al jugar y se congela en pausa y en Game Over', () => {
  const g = new Game({ random: () => 0.5, starsRandom: seeded(9) });
  const snapshot = () => g.starfield.stars.map((s) => s.y);

  const start = snapshot();
  g.update(0.1);
  assert.notDeepEqual(snapshot(), start, 'se mueve');

  g.pause();
  const paused = snapshot();
  g.update(0.5);
  assert.deepEqual(snapshot(), paused, 'pausa');

  g.resume();
  g.triggerGameOver();
  const over = snapshot();
  g.update(0.5);
  assert.deepEqual(snapshot(), over, 'game over');
});

test('Game: el fondo no consume el azar de la partida (determinismo)', () => {
  const run = (starsRandom) => {
    const calls = [];
    const g = new Game({
      random: seeded(100),
      starsRandom,
    });
    const orig = g.random;
    g.random = () => {
      const v = orig();
      calls.push(v);
      return v;
    };
    g.player.fireCooldown = 1e9;
    for (let i = 0; i < 600; i++) g.update(1 / 60);
    return { calls, wave: g.wave, bullets: g.bullets.length, score: g.score };
  };

  const a = run(seeded(1));
  const b = run(seeded(999));

  assert.deepEqual(a, b);
});

test('Game: render con fondo no falla y las estrellas se dibujan antes que los enemigos', () => {
  const g = new Game({ random: () => 0.5, starsRandom: seeded(4) });
  const order = [];
  const ctx = new Proxy(
    {},
    {
      get: (_, prop) => {
        if (prop === 'fillRect') return (x, y, w, h) => order.push({ w, h });
        return () => {};
      },
      set: () => true,
    },
  );

  assert.doesNotThrow(() => g.render(ctx));
  // El primer fillRect es el fondo liso (lienzo completo); luego van las estrellas.
  assert.deepEqual(order[0], { w: C.WIDTH, h: C.HEIGHT });
  assert.deepEqual(order[1], { w: C.STAR_LAYERS[0].size, h: C.STAR_LAYERS[0].size });
});