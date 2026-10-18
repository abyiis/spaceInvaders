import { C } from '../core/constants.js';
import { boxesOverlap } from '../core/collision.js';
import { Formation } from './Formation.js';
import { Player } from './Player.js';
import { NoopSyncGateway } from './SyncGateway.js';

/**
 * Estado y simulación del juego. `update(dt)` no toca el DOM, por lo que
 * puede ejecutarse en Node para las pruebas; `render(ctx)` solo dibuja.
 */
export class Game {
  /**
   * @param {{
   *   width?: number,
   *   height?: number,
   *   random?: () => number,
   *   sync?: import('./SyncGateway.js').SyncGateway,
   * }} [opts]
   *   `random` debe devolver un número en [0, 1). Se inyecta para poder probar.
   *   `sync` es el puerto de red; por defecto no hace nada (modo individual).
   */
  constructor({
    width = C.WIDTH,
    height = C.HEIGHT,
    random = Math.random,
    sync = new NoopSyncGateway(),
  } = {}) {
    this.width = width;
    this.height = height;
    this.random = random;
    this.sync = sync;
    this.startNewGame();
  }

  /** Si un enemigo llega a esta altura, la partida termina. */
  get playerLineY() {
    return this.height - C.PLAYER_BOTTOM_MARGIN - 30;
  }

  /** Reinicia el estado y empieza una partida nueva. */
  startNewGame() {
    this.score = 0;
    this.lives = C.STARTING_LIVES;
    this.wave = 0;
    /** Segundos de juego transcurridos desde `startNewGame()`. */
    this.elapsed = 0;
    this.isGameOver = false;
    /** @type {import('./Bullet.js').Bullet[]} */
    this.bullets = [];
    this.player = new Player(this);
    this.#nextWave();
  }

  #nextWave() {
    this.wave += 1;
    this.formation = new Formation(this, this.wave);
  }

  /** Llamado por `Player` al perder una vida. */
  loseLife() {
    if (this.isGameOver) return;
    this.lives -= 1;
    if (this.lives <= 0) {
      this.triggerGameOver();
    }
  }

  triggerGameOver() {
    this.isGameOver = true;
  }

  /** Libera el gateway de red; llamar al abandonar la partida. */
  dispose() {
    this.sync.dispose();
  }

  /** @param {number} dt Segundos desde el frame anterior. */
  update(dt) {
    if (this.isGameOver) return;

    this.elapsed += dt;
    this.player.update(dt);
    this.sync.publishPlayerX(this.player.x / this.width);
    this.formation.update(dt);
    for (const b of this.bullets) b.update(dt, this.height);

    this.#resolveCollisions();
    this.bullets = this.bullets.filter((b) => !b.dead);

    if (this.isGameOver) return;

    const alive = this.formation.alive;
    if (alive.length === 0) {
      this.score += C.WAVE_BONUS_MULTIPLIER * this.wave;
      this.#nextWave();
      return;
    }

    const lineY = this.playerLineY;
    if (alive.some((e) => e.y + e.h / 2 >= lineY)) {
      this.triggerGameOver();
    }
  }

  #resolveCollisions() {
    const enemies = this.formation.alive;

    for (const bullet of this.bullets) {
      if (bullet.dead) continue;

      if (bullet.fromPlayer) {
        for (const enemy of enemies) {
          if (enemy.dead || !boxesOverlap(bullet, enemy)) continue;
          if (enemy.hit()) {
            this.score += C.SCORE_PER_ENEMY;
            this.sync.emitKill(this.wave, enemy.id, this.elapsed);
          }
          bullet.dead = true;
          break;
        }
      } else if (boxesOverlap(bullet, this.player)) {
        this.player.hit();
        bullet.dead = true;
      }
    }
  }

  /** @param {CanvasRenderingContext2D} ctx */
  render(ctx) {
    ctx.fillStyle = '#0b0e1a';
    ctx.fillRect(0, 0, this.width, this.height);

    for (const enemy of this.formation.alive) enemy.render(ctx);
    for (const bullet of this.bullets) bullet.render(ctx);
    this.player.render(ctx);

    this.#renderHud(ctx);
    if (this.isGameOver) this.#renderGameOver(ctx);
  }

  #renderHud(ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `Puntos: ${this.score}   Vidas: ${this.lives}   Oleada: ${this.wave}`,
      12,
      12,
    );
  }

  #renderGameOver(ctx) {
    ctx.fillStyle = 'rgba(11, 14, 26, 0.6)';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = '#ffd740';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GAME OVER', this.width / 2, this.height / 2 - 20);

    ctx.fillStyle = '#ffffff';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText(`Puntaje: ${this.score}`, this.width / 2, this.height / 2 + 14);
    ctx.fillText('Toca para reiniciar', this.width / 2, this.height / 2 + 42);
  }
}