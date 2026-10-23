import { C } from '../core/constants.js';

/** Bala del jugador (sube) o enemiga (baja). */
export class Bullet {
  /**
   * @param {{x: number, y: number, fromPlayer: boolean, vy: number, vx?: number, color?: string, damage?: number, ownerUid?: string | null}} opts
   */
  constructor({ x, y, fromPlayer, vy, vx = 0, color, damage = 1, ownerUid = null }) {
    this.x = x;
    this.y = y;
    this.w = C.BULLET_WIDTH;
    this.h = C.BULLET_HEIGHT;
    this.fromPlayer = fromPlayer;
    this.vy = vy;
    this.vx = vx;
    this.color = color;
    this.damage = damage;
    this.ownerUid = ownerUid;
    this.dead = false;
  }

  /** @param {number} dt @param {number} worldHeight */
  update(dt, worldHeight) {
    this.y += this.vy * dt;
    this.x += this.vx * dt;
    if (this.y < -this.h || this.y > worldHeight + this.h) {
      this.dead = true;
    }
  }

  /** @param {CanvasRenderingContext2D} ctx */
  render(ctx) {
    ctx.fillStyle = this.color ?? (this.fromPlayer ? '#ffeb3b' : '#ff5252');
    ctx.fillRect(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h);
  }
}
