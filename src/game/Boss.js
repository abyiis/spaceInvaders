import { Bullet } from './Bullet.js';

const DESIGNS = Object.freeze([
  Object.freeze({
    name: 'VANGUARD',
    color: '#ff7043',
    phaseColor: '#ffd166',
    accent: '#ffe0b2',
    width: 92,
    height: 48,
    silhouette: 'balanced',
  }),
  Object.freeze({
    name: 'DREADNOUGHT',
    color: '#ab47bc',
    phaseColor: '#f06292',
    accent: '#e1bee7',
    width: 116,
    height: 56,
    silhouette: 'heavy',
  }),
  Object.freeze({
    name: 'SPECTER',
    color: '#26c6da',
    phaseColor: '#67f5d5',
    accent: '#b2ebf2',
    width: 100,
    height: 44,
    silhouette: 'specter',
  }),
]);

const BOSS_START_Y = 112;
const BOSS_EDGE_MARGIN = 12;
const BOSS_BULLET_SPEED = 190;

export class Boss {
  /**
   * @param {import('./Game.js').Game} game
   * @param {number} wave
   */
  constructor(game, wave) {
    this.game = game;
    this.wave = wave;
    this.level = Math.floor(wave / 3);
    this.design = DESIGNS[(this.level - 1) % DESIGNS.length];
    this.name = this.design.name;
    this.x = game.width / 2;
    this.y = BOSS_START_Y;
    this.w = Math.min(this.design.width, game.width - BOSS_EDGE_MARGIN * 2);
    this.h = this.design.height;
    this.health = wave * 8;
    this.maxHealth = this.health;
    this.direction = 1;
    this.age = 0;
    this.attackTimer = 1;
    this.burstDirection = 1;
    this.support = {
      x: this.x,
      y: this.y + this.h,
      w: 24,
      h: 18,
      hp: 3,
      dead: false,
      healTimer: 3,
    };
  }

  get phase() {
    return this.health < this.maxHealth / 2 ? 2 : 1;
  }

  get color() {
    return this.phase === 2 ? this.design.phaseColor : this.design.color;
  }

  update(dt) {
    this.age += dt;
    const speed = (60 + this.level * 5) * (this.phase === 2 ? 1.8 : 1);
    const halfWidth = this.w / 2;
    const minX = halfWidth + BOSS_EDGE_MARGIN;
    const maxX = this.game.width - halfWidth - BOSS_EDGE_MARGIN;

    this.x += this.direction * speed * dt;
    if (this.x >= maxX) {
      this.x = maxX;
      this.direction = -1;
    } else if (this.x <= minX) {
      this.x = minX;
      this.direction = 1;
    }

    this.y = BOSS_START_Y + (this.phase === 2 ? Math.sin(this.age * 3) * 7 : 0);
    if (!this.support.dead) {
      this.support.x = this.x;
      this.support.y = this.y + this.h / 2 + 17;
      this.support.healTimer -= dt;
      if (this.health > 0 && this.support.healTimer <= 0) {
        this.health = Math.min(this.maxHealth, this.health + 1);
        this.support.healTimer = 3;
      }
    }
    this.attackTimer -= dt;
    if (this.attackTimer <= 0) {
      if (this.phase === 1) {
        this.#fireAt(this.x, this.y + this.h / 2, 0, BOSS_BULLET_SPEED);
        this.attackTimer = 1.25;
      } else {
        this.#specialAttack();
        this.attackTimer = 0.68;
      }
    }
  }

  hit(damage = 1) {
    if (this.health <= 0) return false;
    this.health -= damage;
    return true;
  }

  #fireAt(x, y, vx, vy) {
    if (this.game.sync.isCoop && !this.game.sync.isHost) return;
    this.game.bullets.push(new Bullet({
      x,
      y,
      fromPlayer: false,
      vx,
      vy,
      color: this.color,
    }));
    this.game.sync.emitEnemyShot(
      this.game.elapsed,
      x / this.game.width,
      y / this.game.height,
      vx,
      vy,
      this.color,
    );
  }

  #specialAttack() {
    const attack = Math.floor(this.game.random() * 3);
    const originY = this.y + this.h / 2;

    if (attack === 0) {
      for (let index = -2; index <= 2; index += 1) {
        this.#fireAt(
          this.x,
          originY,
          index * 62,
          BOSS_BULLET_SPEED * 0.88,
        );
      }
      return;
    }

    if (attack === 1) {
      const dx = this.game.player.x - this.x;
      const dy = this.game.player.y - originY;
      const distance = Math.hypot(dx, dy) || 1;
      this.#fireAt(
        this.x,
        originY,
        (dx / distance) * BOSS_BULLET_SPEED,
        (dy / distance) * BOSS_BULLET_SPEED,
      );
      return;
    }

    const lane = this.burstDirection;
    this.burstDirection *= -1;
    for (let index = -1; index <= 1; index += 1) {
      this.#fireAt(
        this.x + index * 22,
        originY,
        lane * index * 34,
        BOSS_BULLET_SPEED * 1.12,
      );
    }
  }

  render(ctx) {
    const left = this.x - this.w / 2;
    const top = this.y - this.h / 2;
    if (!this.support.dead) {
      ctx.fillStyle = 'rgba(104, 240, 210, 0.28)';
      ctx.beginPath();
      ctx.arc(this.support.x, this.support.y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#68f0d2';
      ctx.fillRect(this.support.x - 10, this.support.y - 6, 20, 12);
      ctx.fillStyle = '#e6fff9';
      ctx.fillRect(this.support.x - 2, this.support.y - 3, 4, 6);
    }

    ctx.fillStyle = this.color;
    if (this.design.silhouette === 'heavy') {
      ctx.fillRect(this.x - this.w * 0.38, top + this.h * 0.12, this.w * 0.76, this.h * 0.76);
      ctx.fillRect(left, top + this.h * 0.28, this.w * 0.22, this.h * 0.56);
      ctx.fillRect(left + this.w * 0.78, top + this.h * 0.28, this.w * 0.22, this.h * 0.56);
      ctx.fillRect(this.x - this.w * 0.24, top, this.w * 0.48, this.h * 0.2);
      ctx.fillRect(this.x - this.w * 0.32, top + this.h * 0.82, this.w * 0.16, this.h * 0.18);
      ctx.fillRect(this.x + this.w * 0.16, top + this.h * 0.82, this.w * 0.16, this.h * 0.18);
    } else if (this.design.silhouette === 'specter') {
      ctx.fillRect(this.x - this.w * 0.19, top + this.h * 0.08, this.w * 0.38, this.h * 0.78);
      ctx.fillRect(left + this.w * 0.08, top + this.h * 0.32, this.w * 0.27, this.h * 0.28);
      ctx.fillRect(left + this.w * 0.65, top + this.h * 0.32, this.w * 0.27, this.h * 0.28);
      ctx.fillRect(left + this.w * 0.14, top + this.h * 0.76, this.w * 0.12, this.h * 0.24);
      ctx.fillRect(left + this.w * 0.74, top + this.h * 0.76, this.w * 0.12, this.h * 0.24);
      ctx.fillRect(this.x - this.w * 0.1, top, this.w * 0.2, this.h * 0.18);
    } else {
      ctx.fillRect(this.x - this.w * 0.29, top + this.h * 0.16, this.w * 0.58, this.h * 0.68);
      ctx.fillRect(left, top + this.h * 0.35, this.w * 0.24, this.h * 0.42);
      ctx.fillRect(left + this.w * 0.76, top + this.h * 0.35, this.w * 0.24, this.h * 0.42);
      ctx.fillRect(this.x - this.w * 0.16, top, this.w * 0.32, this.h * 0.24);
    }

    ctx.fillStyle = this.design.accent;
    ctx.fillRect(left + this.w * 0.28, top + this.h * 0.42, this.w * 0.12, this.h * 0.12);
    ctx.fillRect(left + this.w * 0.6, top + this.h * 0.42, this.w * 0.12, this.h * 0.12);
    ctx.fillStyle = '#050811';
    ctx.fillRect(this.x - 3, top + this.h * 0.42, 6, 6);
  }

  renderHealthBar(ctx, width) {
    const barWidth = Math.min(width - 48, 260);
    const x = (width - barWidth) / 2;
    const y = 42;

    ctx.fillStyle = '#0b1222';
    ctx.fillRect(x, y, barWidth, 10);
    ctx.fillStyle = this.color;
    ctx.fillRect(x, y, barWidth * (this.health / this.maxHealth), 10);
    ctx.strokeStyle = this.design.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, barWidth, 10);

    ctx.fillStyle = this.color;
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      `JEFE ${this.level} · ${this.name} · FASE ${this.phase} · ${this.health}/${this.maxHealth}`,
      width / 2,
      y - 5,
    );
  }
}
