import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C } from '../src/core/constants.js';
import { formationOffset, formationRange } from '../src/core/formationPath.js';
import { Formation } from '../src/game/Formation.js';
import { Game } from '../src/game/Game.js';

const path = { speed: 40, range: 108, stepDown: 14 };

test('el rango libre de la rejilla de 6 columnas en el lienzo de 360 px es de 108 px', () => {
  assert.equal(
    formationRange({
      width: C.WIDTH,
      margin: C.FORMATION_SIDE_MARGIN,
      columns: 6,
      spacingX: C.ENEMY_SPACING_X,
      enemyWidth: C.ENEMY_WIDTH,
    }),
    108,
  );
});

test('recorre media distancia hasta la primera pared y rebota con un escalón', () => {
  assert.deepEqual(formationOffset(path, 0), { dx: 0, dy: 0, bounces: 0, direction: 1 });
  assert.equal(formationOffset(path, 1).dx, 40);
  const atWall = formationOffset(path, 54 / 40);
  assert.equal(atWall.bounces, 1);
  assert.equal(atWall.dx, 54);
  assert.equal(atWall.dy, 14);
  assert.equal(atWall.direction, -1);
});

test('después del primer rebote recorre el rango completo en cada sentido', () => {
  const secondWall = formationOffset(path, (54 + 108) / 40);
  assert.equal(secondWall.bounces, 2);
  assert.ok(Math.abs(secondWall.dx + 54) < 1e-9);
  assert.equal(secondWall.dy, 28);
  assert.equal(secondWall.direction, 1);
  const third = formationOffset(path, (54 + 216) / 40);
  assert.equal(third.bounces, 3);
  assert.equal(third.dy, 42);
});

test('el desplazamiento horizontal es continuo y nunca sale del rango', () => {
  let previous = formationOffset(path, 0).dx;
  for (let t = 0.01; t < 60; t += 0.01) {
    const { dx } = formationOffset(path, t);
    assert.ok(Math.abs(dx - previous) <= path.speed * 0.01 + 1e-9, `salto en t=${t}`);
    assert.ok(Math.abs(dx) <= path.range / 2 + 1e-9);
    previous = dx;
  }
});

test('tiempo negativo, rango nulo o velocidad nula dejan la formación quieta', () => {
  assert.equal(formationOffset(path, -3).dx, 0);
  assert.deepEqual(formationOffset({ ...path, range: 0 }, 10), { dx: 0, dy: 0, bounces: 0, direction: 1 });
  assert.deepEqual(formationOffset({ ...path, speed: 0 }, 10), { dx: 0, dy: 0, bounces: 0, direction: 1 });
});

// El kamikaze en picado persigue al jugador con su propia integración: queda fuera de la comparación.
const positions = (formation) => formation.enemies
  .filter((enemy) => enemy.type !== 'kamikaze')
  .map(({ id, x, y }) => ({ id, x, y }));

test('dos formaciones con el mismo tiempo coinciden aunque se actualicen con dt distintos', () => {
  const a = new Formation(new Game({ random: () => 0.5 }), 4);
  const b = new Formation(new Game({ random: () => 0.5 }), 4);
  a.shootTimer = b.shootTimer = Infinity;
  for (let i = 0; i < 600; i += 1) a.update(1 / 60);
  for (let i = 0; i < 100; i += 1) b.update(0.1);

  assert.ok(Math.abs(a.time - b.time) < 1e-9);
  positions(a).forEach((position, index) => {
    assert.ok(Math.abs(position.x - positions(b)[index].x) < 1e-6);
    assert.ok(Math.abs(position.y - positions(b)[index].y) < 1e-6);
  });
});

test('las bajas no alteran el movimiento de los enemigos que siguen vivos', () => {
  const a = new Formation(new Game({ random: () => 0.5 }), 3);
  const b = new Formation(new Game({ random: () => 0.5 }), 3);
  a.shootTimer = b.shootTimer = Infinity;
  for (const enemy of b.enemies.filter((candidate) => candidate.id % 6 === 0 || candidate.id % 6 === 5)) {
    enemy.dead = true;
  }
  for (let i = 0; i < 900; i += 1) {
    a.update(1 / 60);
    b.update(1 / 60);
  }
  for (const enemy of b.alive) {
    const twin = a.enemies.find((candidate) => candidate.id === enemy.id);
    assert.ok(Math.abs(enemy.x - twin.x) < 1e-9);
    assert.ok(Math.abs(enemy.y - twin.y) < 1e-9);
  }
});

test('una oleada anunciada por el host con retraso nace ya desplazada a su tiempo', () => {
  const game = new Game({ random: () => 0.5 });
  game.elapsed = 10;
  const onTime = new Formation(game, 2, { startElapsed: 10 });
  const late = new Formation(game, 2, { startElapsed: 8.5 });
  const reference = new Formation(new Game({ random: () => 0.5 }), 2);
  reference.update(1.5);
  late.enemies.forEach((enemy, index) => {
    assert.ok(Math.abs(enemy.x - reference.enemies[index].x) < 1e-9);
  });
  assert.equal(onTime.time, 0);
  assert.equal(late.time, 1.5);
});

test('los kamikazes abandonan la formación a un tiempo de oleada determinista', () => {
  const formation = new Formation(new Game({ random: () => 0.5 }), 2);
  formation.shootTimer = Infinity;
  const kamikaze = formation.enemies.find((enemy) => enemy.type === 'kamikaze');
  while (formation.time < kamikaze.diveAt - 0.05) formation.update(0.05);
  assert.equal(kamikaze.diving, false);
  formation.update(0.1);
  assert.equal(kamikaze.diving, true);
});
