import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/Game.js';
import { Hazards } from '../src/game/Hazards.js';
import { Boss } from '../src/game/Boss.js';
import { BonusStage } from '../src/game/BonusStage.js';
import { Bullet } from '../src/game/Bullet.js';

test('darkness ya no forma parte de los eventos ambientales posibles', () => {
  const game = new Game();
  const hazards = new Hazards(game, () => 0.999);
  hazards.nextEventIn = 0;
  hazards.update(0.01);
  assert.notEqual(hazards.active?.type, 'darkness');
  assert.ok(['asteroids', 'magnetic'].includes(hazards.active?.type));
});

test('emite una alerta previa (warning) 3 segundos antes de iniciar un evento ambiental', () => {
  const game = new Game();
  const hazards = new Hazards(game, () => 0); // Selecciona 'asteroids'
  hazards.nextEventIn = 3.5;
  hazards.update(0.4); // Quedan 3.1s: aún sin alerta
  assert.equal(hazards.pendingType, null);
  assert.equal(hazards.warningRemaining, 0);

  hazards.update(0.2); // Quedan 2.9s: se activa la alerta
  assert.equal(hazards.pendingType, 'asteroids');
  assert.ok(hazards.warningRemaining > 0 && hazards.warningRemaining <= 3);

  hazards.update(3.0); // Concluye la alerta e inicia el evento
  assert.equal(hazards.pendingType, null);
  assert.equal(hazards.active?.type, 'asteroids');
});

test('el jugador puede disparar y sus balas viajan durante la ronda bonus', () => {
  const game = new Game();
  game.bonusStage = new BonusStage(game);
  game.bonusStage.ships = []; // Sin naves en pantalla en este instante
  const bullet = new Bullet({
    x: game.width / 2,
    y: game.height - 100,
    fromPlayer: true,
    vy: -300,
  });
  game.bullets.push(bullet);

  // La bala no debe destruirse inmediatamente solo por estar en bonus stage
  game.update(0.01);
  assert.equal(bullet.dead, false);
  assert.ok(bullet.y < game.height - 100);
});

test('el jefe rota aleatoriamente entre los ataques especiales en segunda fase sin repetir el mismo consecutivamente', () => {
  const game = new Game();
  const boss = new Boss(game, 3);
  boss.health = 10; // Fuerza fase 2
  assert.equal(boss.phase, 2);

  const attacksUsed = new Set();
  let previousAttack = null;

  for (let i = 0; i < 20; i += 1) {
    boss.attackTimer = 0;
    boss.update(0.01);
    const currentAttack = boss.lastSpecialAttack;
    assert.ok([0, 1, 2].includes(currentAttack));
    attacksUsed.add(currentAttack);

    if (previousAttack !== null) {
      assert.notEqual(currentAttack, previousAttack, 'El jefe no debe repetir el mismo ataque consecutivamente');
    }
    previousAttack = currentAttack;
  }

  // Verifica que se hayan usado múltiples ataques especiales diferentes
  assert.ok(attacksUsed.size >= 2);
});

