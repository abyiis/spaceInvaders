import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C } from '../src/core/constants.js';
import { Game } from '../src/game/Game.js';
import { Bullet } from '../src/game/Bullet.js';

/** Generador pseudoaleatorio determinista (mulberry32) para pruebas reproducibles. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const newGame = () => new Game({ random: seeded(1) });

test('estado inicial', () => {
  const g = newGame();
  assert.equal(g.score, 0);
  assert.equal(g.lives, C.STARTING_LIVES);
  assert.equal(g.wave, 1);
  assert.equal(g.isGameOver, false);
  assert.equal(g.formation.enemies.length, 3 * 6);
});

test('una bala del jugador destruye a un enemigo y suma puntos', () => {
  const g = newGame();
  const enemy = g.formation.enemies[0];
  g.bullets.push(new Bullet({ x: enemy.x, y: enemy.y, fromPlayer: true, vy: -C.PLAYER_BULLET_SPEED }));

  g.update(0.001);

  assert.equal(enemy.dead, true);
  assert.equal(g.score, C.SCORE_PER_ENEMY);
});

test('una bala enemiga quita una vida y la invulnerabilidad evita un segundo golpe', () => {
  const g = newGame();
  const shoot = () =>
    g.bullets.push(new Bullet({ x: g.player.x, y: g.player.y, fromPlayer: false, vy: C.ENEMY_BULLET_SPEED }));

  shoot();
  g.update(0.001);
  assert.equal(g.lives, C.STARTING_LIVES - 1);
  assert.equal(g.player.isInvulnerable, true);

  shoot();
  g.update(0.001);
  assert.equal(g.lives, C.STARTING_LIVES - 1, 'no debe perder otra vida mientras es invulnerable');

  g.update(C.PLAYER_INVULNERABLE_SECONDS + 0.1);
  shoot();
  g.update(0.001);
  assert.equal(g.lives, C.STARTING_LIVES - 2);
});

test('sin vidas termina la partida', () => {
  const g = newGame();
  g.lives = 1;
  g.bullets.push(new Bullet({ x: g.player.x, y: g.player.y, fromPlayer: false, vy: C.ENEMY_BULLET_SPEED }));

  g.update(0.001);

  assert.equal(g.lives, 0);
  assert.equal(g.isGameOver, true);
});

test('si un enemigo alcanza la línea del jugador termina la partida', () => {
  const g = newGame();
  g.formation.enemies[0].y = g.playerLineY;

  g.update(0.001);

  assert.equal(g.isGameOver, true);
});

test('onGameOver recibe un único resultado y se rearma al iniciar otra partida', () => {
  const results = [];
  const g = new Game({
    random: seeded(1),
    onGameOver: (result) => results.push(result),
  });
  g.score = 80;
  g.wave = 3;
  g.elapsed = 12.5;

  g.triggerGameOver();
  g.triggerGameOver();

  assert.deepEqual(results, [
    {
      mode: 'solo',
      score: 80,
      wave: 3,
      durationSeconds: 12.5,
    },
  ]);

  g.startNewGame();
  g.elapsed = 4;
  g.triggerGameOver();
  assert.equal(results.length, 2);
  assert.equal(results[1].score, 0);
  assert.equal(results[1].durationSeconds, 4);
});

test('al destruir todos los enemigos empieza la siguiente oleada con bonus', () => {
  const g = newGame();
  for (const e of g.formation.enemies) e.dead = true;

  g.update(0.001);

  assert.equal(g.wave, 2);
  assert.equal(g.score, C.WAVE_BONUS_MULTIPLIER * 1);
  assert.equal(g.formation.enemies.length, 3 * 6);
});

test('desde la oleada 5 las filas pares tienen 2 de vida', () => {
  const g = newGame();
  g.wave = 4;
  for (const e of g.formation.enemies) e.dead = true;
  g.update(0.001);

  assert.equal(g.wave, 5);
  const enemies = g.formation.enemies;
  assert.ok(enemies.filter((e) => e.row % 2 === 0).every((e) => e.hp === 2));
  assert.ok(enemies.filter((e) => e.row % 2 === 1).every((e) => e.hp === 1));
});

test('un enemigo de 2 de vida necesita dos impactos', () => {
  const g = newGame();
  const enemy = g.formation.enemies[0];
  enemy.hp = 2;
  const fire = () =>
    g.bullets.push(new Bullet({ x: enemy.x, y: enemy.y, fromPlayer: true, vy: -C.PLAYER_BULLET_SPEED }));

  fire();
  g.update(0.001);
  assert.equal(enemy.dead, false);
  assert.equal(g.score, 0);

  fire();
  g.update(0.001);
  assert.equal(enemy.dead, true);
  assert.equal(g.score, C.SCORE_PER_ENEMY);
});

test('la formación rebota en los bordes y baja un escalón', () => {
  const g = newGame();
  const enemies = g.formation.enemies;
  const y0 = enemies[0].y;

  // Lo bastante largo para llegar al borde derecho en la oleada 1 (40 px/s).
  g.player.invulnerable = 1e9; // evita que un disparo enemigo termine la prueba
  for (let i = 0; i < 60 * 6 && g.formation.direction === 1; i++) g.update(1 / 60);

  assert.equal(g.formation.direction, -1);
  assert.ok(enemies[0].y > y0);
});

test('las balas fuera de pantalla se eliminan', () => {
  const g = newGame();
  g.player.fireCooldown = 1e9; // el jugador no dispara en esta prueba
  g.bullets.push(new Bullet({ x: 10, y: 5, fromPlayer: true, vy: -C.PLAYER_BULLET_SPEED }));

  g.update(0.1);

  assert.equal(g.bullets.length, 0);
});

test('startNewGame reinicia todo el estado', () => {
  const g = newGame();
  g.score = 999;
  g.lives = 0;
  g.wave = 7;
  g.isGameOver = true;

  g.startNewGame();

  assert.equal(g.score, 0);
  assert.equal(g.lives, C.STARTING_LIVES);
  assert.equal(g.wave, 1);
  assert.equal(g.isGameOver, false);
  assert.equal(g.bullets.length, 0);
});

test('moveBy mantiene la nave dentro de la pantalla', () => {
  const g = newGame();
  g.player.moveBy(-10_000);
  assert.equal(g.player.x, C.PLAYER_WIDTH / 2);
  g.player.moveBy(10_000);
  assert.equal(g.player.x, C.WIDTH - C.PLAYER_WIDTH / 2);
});

test('simulación larga sin errores y con valores finitos', () => {
  const g = newGame();
  for (let i = 0; i < 60 * 600; i++) {
    // Zigzag para que el jugador acierte y esquive algo.
    g.player.moveDir = Math.sin(i / 90) > 0 ? 1 : -1;
    g.update(1 / 60);
    if (g.isGameOver) g.startNewGame();
  }
  assert.ok(Number.isFinite(g.score) && g.score >= 0);
  assert.ok(g.lives >= 0 && g.lives <= C.STARTING_LIVES);
  assert.ok(g.wave >= 1);
});
