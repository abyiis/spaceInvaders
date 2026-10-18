import { C } from '../core/constants.js';
import { Bullet } from './Bullet.js';

/** Nave del jugador: se mueve en horizontal y dispara automáticamente. */
export class Player {
  /** @param {import('./Game.js').Game} game */
  constructor(game) {
    this.game = game;
    this.x = game.width / 2;
    this.y = game.height - C.PLAYER_BOTTOM_MARGIN;
    this.w = C.PLAYER_WIDTH;
    this.h = C.PLAYER_HEIGHT;

    /** Dirección por teclado: -1, 0 o 1. */
    this.moveDir = 0;
    this.invulnerable = 0;
    this.fireCooldown = 0;
  }

  get isInvulnerable() {
    return this.invulnerable > 0;
  }

  /** Desplaza la nave `dx` píxeles lógicos, sin salir de la pantalla. */
  moveBy(dx) {
    const min = this.w / 2;
    const max = this.game.width - this.w / 2;
    this.x = Math.min(Math.max(this.x + dx, min), max);
  }

  /**
   * Recibe un impacto enemigo.
   * @returns {boolean} `true` si se perdió una vida.
   */
  hit() {
    if (this.isInvulnerable || this.game.isGameOver) return false;
    this.invulnerable = C.PLAYER_INVULNERABLE_SECONDS;
    this.game.sync.emitHit(this.game.elapsed);
    this.game.loseLife();
    return true;
  }

  /** @param {number} dt */
  update(dt) {
    if (this.moveDir !== 0) {
      this.moveBy(this.moveDir * C.PLAYER_KEYBOARD_SPEED * dt);
    }

    if (this.invulnerable > 0) {
      this.invulnerable -= dt;
    }

    this.fireCooldown -= dt;
    if (this.fireCooldown <= 0) {
      this.fireCooldown = C.PLAYER_FIRE_INTERVAL;
      this.game.bullets.push(
        new Bullet({
          x: this.x,
          y: this.y - this.h / 2,
          fromPlayer: true,
          vy: -C.PLAYER_BULLET_SPEED,
        }),
      );
      this.game.sync.emitShot(this.game.elapsed, this.x / this.game.width);
    }
  }

  /** @param {CanvasRenderingContext2D} ctx */
  render(ctx) {
    // Parpadeo durante la invulnerabilidad.
    const blinkOff = this.isInvulnerable && Math.floor(this.invulnerable * 10) % 2 === 0;
    ctx.fillStyle = blinkOff ? 'rgba(79, 195, 247, 0.33)' : '#4fc3f7';
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - this.h / 2);
    ctx.lineTo(this.x + this.w / 2, this.y + this.h / 2);
    ctx.lineTo(this.x - this.w / 2, this.y + this.h / 2);
    ctx.closePath();
    ctx.fill();
  }
}