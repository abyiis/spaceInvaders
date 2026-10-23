import { C } from '../core/constants.js';
import { waveParams } from '../core/difficulty.js';
import { Bullet } from './Bullet.js';
import { Enemy } from './Enemy.js';

/**
 * Controlador de una oleada: crea y mueve el grupo de enemigos
 * y gestiona sus disparos.
 */
export class Formation {
  /**
   * @param {import('./Game.js').Game} game
   * @param {number} wave Número de oleada (empieza en 1).
   */
  constructor(game, wave) {
    this.game = game;
    this.wave = wave;
    this.params = waveParams(wave);
    /** @type {Enemy[]} */
    this.enemies = [];
    this.direction = 1;
    this.supportTimer = 1.5;

    const { rows, columns } = this.params;
    const totalWidth = (columns - 1) * C.ENEMY_SPACING_X;
    const startX = (game.width - totalWidth) / 2;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        this.enemies.push(
          new Enemy({
            id: row * columns + col,
            x: startX + col * C.ENEMY_SPACING_X,
            y: C.FORMATION_TOP + row * C.ENEMY_SPACING_Y,
            row,
            type: wave >= 2 && row === rows - 1 && col === columns - 1
              ? 'kamikaze'
              : wave >= 3 && row === 0 && col === Math.floor(columns / 2)
                ? 'support'
                : 'normal',
            // Spec game_loop.md §2: 2 de vida desde la oleada 5 en filas pares.
            hp: wave >= 5 && row % 2 === 0 ? 2 : 1,
          }),
        );
      }
    }

    this.shootTimer = this.#nextShootDelay();
  }

  /** Variación de ±50 % alrededor del intervalo medio. */
  #nextShootDelay() {
    return this.params.shootInterval * (0.5 + this.game.random());
  }

  /** Enemigos que siguen vivos. */
  get alive() {
    return this.enemies.filter((e) => !e.dead);
  }

  /** @param {number} dt */
  update(dt) {
    const alive = this.alive;
    if (alive.length === 0) return;

    for (const enemy of alive) {
      enemy.shieldTime = Math.max(0, enemy.shieldTime - dt);
      if (enemy.type !== 'kamikaze') continue;
      if (!enemy.diving) {
        enemy.diveTimer -= dt;
        if (enemy.diveTimer <= 0) enemy.diving = true;
      }
      if (enemy.diving) {
        const targets = [this.game.player];
        if (this.game.remotePlayer && !this.game.remotePlayer.eliminated && !this.game.remotePlayer.downedTimer) {
          targets.push(this.game.remotePlayer);
        }
        const target = targets.reduce((closest, candidate) =>
          Math.abs(candidate.x - enemy.x) < Math.abs(closest.x - enemy.x) ? candidate : closest);
        const dx = target.x - enemy.x;
        enemy.x += Math.sign(dx) * Math.min(Math.abs(dx), 95 * dt);
        enemy.y += 185 * dt;
        if (enemy.y - enemy.h / 2 > this.game.height) enemy.dead = true;
      }
    }

    const formationAlive = alive.filter((enemy) => !enemy.diving);
    this.#move(formationAlive, dt);
    this.#shieldNearbyEnemies(formationAlive, dt);
    this.#shoot(alive, dt);
  }

  #shieldNearbyEnemies(alive, dt) {
    const support = alive.find((enemy) => enemy.type === 'support');
    if (!support) return;
    this.supportTimer -= dt;
    if (this.supportTimer > 0) return;
    this.supportTimer = 2.8;

    alive
      .filter((enemy) => enemy !== support && enemy.type !== 'support')
      .sort((a, b) => Math.hypot(a.x - support.x, a.y - support.y)
        - Math.hypot(b.x - support.x, b.y - support.y))
      .slice(0, 3)
      .forEach((enemy) => {
        enemy.shieldTime = Math.max(enemy.shieldTime, 2.4);
      });
  }

  #move(alive, dt) {
    const dx = this.direction * this.params.speed * dt;
    const halfW = C.ENEMY_WIDTH / 2;
    const margin = C.FORMATION_SIDE_MARGIN;

    let minX = Infinity;
    let maxX = -Infinity;
    for (const e of alive) {
      minX = Math.min(minX, e.x);
      maxX = Math.max(maxX, e.x);
    }

    const hitsRight = this.direction > 0 && maxX + halfW + dx > this.game.width - margin;
    const hitsLeft = this.direction < 0 && minX - halfW + dx < margin;

    if (hitsRight || hitsLeft) {
      this.direction = -this.direction;
      for (const e of alive) e.y += C.FORMATION_STEP_DOWN;
    } else {
      for (const e of alive) e.x += dx;
    }
  }

  #shoot(alive, dt) {
    this.shootTimer -= dt;
    if (this.shootTimer > 0) return;
    this.shootTimer = this.#nextShootDelay();

    const shooter = alive[Math.floor(this.game.random() * alive.length)];
    if (this.game.sync.isCoop && !this.game.sync.isHost) return;
    const bulletX = shooter.x;
    const bulletY = shooter.y + C.ENEMY_HEIGHT / 2;
    const bulletSpeed = C.ENEMY_BULLET_SPEED;
    this.game.bullets.push(
      new Bullet({
        x: bulletX,
        y: bulletY,
        fromPlayer: false,
        vy: bulletSpeed,
      }),
    );
    this.game.sync.emitEnemyShot(
      this.game.elapsed,
      bulletX / this.game.width,
      bulletY / this.game.height,
      0,
      bulletSpeed,
    );
  }
}