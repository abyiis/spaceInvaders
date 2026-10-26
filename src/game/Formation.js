import { C } from '../core/constants.js';
import { waveParams } from '../core/difficulty.js';
import { formationOffset, formationRange } from '../core/formationPath.js';
import { createShotSchedule, pickShooter } from '../core/shotSchedule.js';
import { Bullet } from './Bullet.js';
import { Enemy } from './Enemy.js';
import { entranceProgress } from './visuals.js';

/**
 * Controlador de una oleada: crea y mueve el grupo de enemigos
 * y gestiona sus disparos.
 */
export class Formation {
  /**
   * @param {import('./Game.js').Game} game
   * @param {number} wave Número de oleada (empieza en 1).
   * @param {{ startElapsed?: number }} [options] `startElapsed`: tiempo de juego en que empezó la
   *   oleada. En coop lo fija el host (evento `phase`); por defecto es el instante actual.
   */
  constructor(game, wave, { startElapsed = game.elapsed } = {}) {
    this.game = game;
    this.wave = wave;
    this.params = waveParams(wave);
    /** @type {Enemy[]} */
    this.enemies = [];
    this.direction = 1;
    this.supportTimer = 1.5;
    /** Segundos desde que empezó la oleada (con la ventaja de un inicio anunciado por el host). */
    this.time = Math.max(0, game.elapsed - startElapsed);
    this.path = {
      speed: this.params.speed,
      range: formationRange({
        width: game.width,
        margin: C.FORMATION_SIDE_MARGIN,
        columns: this.params.columns,
        spacingX: C.ENEMY_SPACING_X,
        enemyWidth: C.ENEMY_WIDTH,
      }),
      stepDown: C.FORMATION_STEP_DOWN,
    };
    /** `false` desactiva la animación de entrada (las pruebas de combate la apagan). */
    this.entranceEnabled = true;
    this.appliedDx = 0;
    this.appliedDy = 0;

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

    this.schedule = createShotSchedule({
      seed: game.seed,
      wave,
      interval: this.params.shootInterval,
    });
    this.nextShot = this.schedule.next();
    this.#follow(this.enemies);
    this.#updateEntrance();
  }

  /** Enemigos que siguen vivos. */
  get alive() {
    return this.enemies.filter((e) => !e.dead);
  }

  /** @param {number} dt */
  update(dt) {
    this.time += dt;
    this.#updateEntrance();
    const alive = this.alive;
    if (alive.length === 0) return;

    for (const enemy of alive) {
      enemy.shieldTime = Math.max(0, enemy.shieldTime - dt);
      if (enemy.type !== 'kamikaze') continue;
      if (!enemy.diving && this.time >= enemy.diveAt) enemy.diving = true;
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
    this.#follow(formationAlive);
    this.#shieldNearbyEnemies(formationAlive, dt);
    this.#shoot();
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

  /** Entrada escalonada desde arriba (`visual_feedback.md` §4), según el tiempo de la oleada. */
  #updateEntrance() {
    const { columns } = this.params;
    for (const enemy of this.enemies) {
      enemy.entrance = this.entranceEnabled
        ? entranceProgress(this.time, enemy.row, enemy.id % columns)
        : 1;
      enemy.reducedMotion = this.game.reducedMotion === true;
    }
  }

  /**
   * Coloca la formación según su posición analítica en el instante `time`. Se aplica la
   * diferencia con lo ya aplicado (no se reescriben posiciones absolutas) para respetar los
   * desplazamientos externos; los kamikazes en picado quedan fuera.
   */
  #follow(members) {
    const { dx, dy, direction } = formationOffset(this.path, this.time);
    const stepX = dx - this.appliedDx;
    const stepY = dy - this.appliedDy;
    this.appliedDx = dx;
    this.appliedDy = dy;
    this.direction = direction;
    for (const enemy of members) {
      enemy.x += stepX;
      enemy.y += stepY;
    }
  }

  /**
   * Dispara según el calendario de la oleada. Cada cliente coop lo recorre por su cuenta y
   * obtiene los mismos disparos, así que no se envían por la red.
   */
  #shoot() {
    for (let fired = 0; fired < 8 && this.time >= this.nextShot.time; fired += 1) {
      const { pick } = this.nextShot;
      this.nextShot = this.schedule.next();
      const shooter = pickShooter(
        this.enemies,
        pick,
        (enemy) => !enemy.dead && !enemy.diving && enemy.entrance >= 1,
      );
      if (!shooter) continue;
      this.game.bullets.push(
        new Bullet({
          x: shooter.x,
          y: shooter.y + C.ENEMY_HEIGHT / 2,
          fromPlayer: false,
          vy: C.ENEMY_BULLET_SPEED,
        }),
      );
    }
  }
}
