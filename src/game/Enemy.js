import { C } from '../core/constants.js';

const ROW_COLORS = ['#66bb6a', '#ab47bc', '#ff7043', '#26c6da', '#ec407a', '#ffca28'];

/** Enemigo individual. Su movimiento lo controla `Formation`. */
export class Enemy {
  /**
   * @param {{x: number, y: number, row: number, hp?: number}} opts
   */
  constructor({ x, y, row, hp = 1 }) {
    this.x = x;
    this.y = y;
    this.w = C.ENEMY_WIDTH;
    this.h = C.ENEMY_HEIGHT;
    this.row = row;
    this.hp = hp;
    this.dead = false;
  }

  /**
   * Aplica un impacto.
   * @returns {boolean} `true` si este impacto destruyó al enemigo.
   */
  hit() {
    if (this.dead) return false;
    this.hp -= 1;
    if (this.hp <= 0) {
      this.dead = true;
      return true;
    }
    return false;
  }

  /** @param {CanvasRenderingContext2D} ctx */
  render(ctx) {
    const left = this.x - this.w / 2;
    const top = this.y - this.h / 2;

    ctx.fillStyle = ROW_COLORS[this.row % ROW_COLORS.length];
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(left, top, this.w, this.h, 5);
    } else {
      // WebViews antiguos no incluyen roundRect.
      ctx.rect(left, top, this.w, this.h);
    }
    ctx.fill();

    // Un enemigo con 2 de vida muestra un borde para distinguirse.
    if (this.hp > 1) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = '#0b0e1a';
    ctx.beginPath();
    ctx.arc(left + this.w * 0.3, top + this.h * 0.45, 3, 0, Math.PI * 2);
    ctx.arc(left + this.w * 0.7, top + this.h * 0.45, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
