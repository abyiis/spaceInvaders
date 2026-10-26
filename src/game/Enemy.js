import { C } from '../core/constants.js';
import { easeOutCubic, VISUALS } from './visuals.js';

const ROW_COLORS = ['#66bb6a', '#ab47bc', '#ff7043', '#26c6da', '#ec407a', '#ffca28'];

/** Enemigo individual. Su movimiento lo controla `Formation`. */
export class Enemy {
  /**
   * @param {{id: number, x: number, y: number, row: number, hp?: number}} opts
   *   `id` es el índice del enemigo en su oleada (`row * columns + col`).
   */
  constructor({ id, x, y, row, hp = 1, type = 'normal' }) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.w = C.ENEMY_WIDTH;
    this.h = C.ENEMY_HEIGHT;
    this.row = row;
    this.hp = hp;
    this.type = type;
    this.shieldTime = 0;
    this.diving = false;
    /** Segundos de oleada a partir de los cuales el kamikaze abandona la formación. */
    this.diveAt = type === 'kamikaze' ? 4 + (id % 4) * 1.2 : Infinity;
    this.dead = false;
    /** Progreso de la entrada (0..1); mientras sea < 1 no recibe ni dispara balas. */
    this.entrance = 1;
    this.reducedMotion = false;
  }

  /**
   * Aplica un impacto.
   * @returns {boolean} `true` si este impacto destruyó al enemigo.
   */
  hit(damage = 1) {
    if (this.dead) return false;
    if (this.shieldTime > 0) {
      this.shieldTime = 0;
      return false;
    }
    this.hp -= damage;
    if (this.hp <= 0) {
      this.dead = true;
      return true;
    }
    return false;
  }

  get color() {
    if (this.type === 'kamikaze') return '#ff596e';
    if (this.type === 'support') return '#68f0d2';
    return ROW_COLORS[this.row % ROW_COLORS.length];
  }

  /** @param {CanvasRenderingContext2D} ctx */
  render(ctx) {
    if (this.entrance < 1) {
      const eased = easeOutCubic(this.entrance);
      ctx.save();
      ctx.globalAlpha = eased;
      if (!this.reducedMotion) ctx.translate(0, -(1 - eased) * VISUALS.ENTRANCE_DROP);
      this.#draw(ctx);
      ctx.restore();
      return;
    }
    this.#draw(ctx);
  }

  #draw(ctx) {
    const left = this.x - this.w / 2;
    const top = this.y - this.h / 2;

    ctx.fillStyle = this.color;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(left, top, this.w, this.h, 5);
    } else {
      // WebViews antiguos no incluyen roundRect.
      ctx.rect(left, top, this.w, this.h);
    }
    ctx.fill();

    if (this.hp > 1 || this.shieldTime > 0) {
      ctx.strokeStyle = this.shieldTime > 0 ? '#a8fff0' : '#ffffff';
      ctx.lineWidth = this.shieldTime > 0 ? 2.5 : 2;
      ctx.stroke();
    }

    if (this.type === 'kamikaze') {
      ctx.fillStyle = '#7c1529';
      ctx.beginPath();
      ctx.moveTo(this.x, top + this.h * 0.72);
      ctx.lineTo(this.x - 4, top + this.h + 5);
      ctx.lineTo(this.x + 4, top + this.h + 5);
      ctx.closePath();
      ctx.fill();
    } else if (this.type === 'support') {
      ctx.fillStyle = '#e6fff9';
      ctx.fillRect(this.x - 2, top + 3, 4, this.h - 6);
      ctx.fillRect(this.x - 5, top + this.h / 2 - 2, 10, 4);
    }

    ctx.fillStyle = '#0b0e1a';
    ctx.beginPath();
    ctx.arc(left + this.w * 0.3, top + this.h * 0.45, 3, 0, Math.PI * 2);
    ctx.arc(left + this.w * 0.7, top + this.h * 0.45, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}