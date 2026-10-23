import { C } from '../core/constants.js';
import { Bullet } from './Bullet.js';
import { POWER_UPS } from './powerUps.js';

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
    this.shieldPowerUp = 0;
    this.fireCooldown = 0;
    this.rapidFire = 0;
    this.tripleShot = 0;
    this.overdrive = 0;
    this.downedTimer = 0;
    this.eliminated = false;
  }

  get isInvulnerable() {
    return this.invulnerable > 0 || this.shieldPowerUp > 0;
  }

  /** Desplaza la nave `dx` píxeles lógicos, sin salir de la pantalla. */
  moveBy(dx) {
    if (this.downedTimer > 0 || this.eliminated) return;
    const min = this.w / 2;
    const max = this.game.width - this.w / 2;
    this.x = Math.min(Math.max(this.x + dx, min), max);
  }

  /**
   * Recibe un impacto enemigo.
   * @returns {boolean} `true` si se perdió una vida.
   */
  hit() {
    if (this.isInvulnerable || this.downedTimer > 0 || this.eliminated || this.game.isGameOver) {
      return false;
    }
    if (this.game.sync.isCoop) {
      this.downedTimer = 5;
      this.game.sync.emitHit(this.game.elapsed);
      this.game.effects.hit();
      return true;
    }
    this.invulnerable = C.PLAYER_INVULNERABLE_SECONDS;
    this.game.sync.emitHit(this.game.elapsed);
    this.game.effects.hit();
    this.game.loseLife();
    return true;
  }

  activatePowerUp(type) {
    const powerUp = POWER_UPS[type];
    if (!powerUp) return false;

    if (type === 'shield') {
      this.shieldPowerUp = Math.max(this.shieldPowerUp, powerUp.duration);
    } else if (type === 'rapidFire') {
      this.rapidFire = Math.max(this.rapidFire, powerUp.duration);
    } else if (type === 'tripleShot') {
      this.tripleShot = Math.max(this.tripleShot, powerUp.duration);
    } else if (type === 'overdrive') {
      this.overdrive = Math.max(this.overdrive, powerUp.duration);
    }
    return true;
  }

  revive() {
    if (this.eliminated) return false;
    this.downedTimer = 0;
    this.invulnerable = C.PLAYER_INVULNERABLE_SECONDS;
    return true;
  }

  /** @param {number} dt */
  update(dt) {
    if (this.downedTimer > 0) {
      this.downedTimer = Math.max(0, this.downedTimer - dt);
      if (this.downedTimer === 0) this.game.expireDownedPlayer();
      return;
    }
    if (this.eliminated) return;

    if (this.moveDir !== 0) {
      this.moveBy(this.moveDir * C.PLAYER_KEYBOARD_SPEED * dt);
    }

    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.shieldPowerUp = Math.max(0, this.shieldPowerUp - dt);
    this.rapidFire = Math.max(0, this.rapidFire - dt);
    this.tripleShot = Math.max(0, this.tripleShot - dt);
    this.overdrive = Math.max(0, this.overdrive - dt);

    this.fireCooldown -= dt;
    if (this.fireCooldown <= 0) {
      this.fireCooldown = C.PLAYER_FIRE_INTERVAL * (this.rapidFire > 0 ? 0.55 : 1);
      const shots = this.tripleShot > 0
        ? [
          { x: this.x - 9, vx: -90, vy: -C.PLAYER_BULLET_SPEED * 0.9 },
          { x: this.x, vx: 0, vy: -C.PLAYER_BULLET_SPEED },
          { x: this.x + 9, vx: 90, vy: -C.PLAYER_BULLET_SPEED * 0.9 },
        ]
        : [{ x: this.x, vx: 0, vy: -C.PLAYER_BULLET_SPEED }];

      for (const shot of shots) {
        this.game.bullets.push(
          new Bullet({
            ...shot,
            y: this.y - this.h / 2,
            fromPlayer: true,
            damage: this.overdrive > 0 ? 2 : 1,
            ownerUid: this.game.sync.uid,
          }),
        );
        this.game.sync.emitShot(
          this.game.elapsed,
          shot.x / this.game.width,
          this.overdrive > 0 ? 2 : 1,
          shot.vx,
        );
      }
      this.game.effects.shot();
    }
  }

  /** @param {CanvasRenderingContext2D} ctx */
  render(ctx) {
    if (this.eliminated) return;
    if (this.downedTimer > 0) {
      ctx.save();
      ctx.globalAlpha = 0.28 + Math.sin(this.game.elapsed * 10) * 0.12;
    }
    // Parpadeo durante la invulnerabilidad.
    const shieldTime = Math.max(this.invulnerable, this.shieldPowerUp);
    const blinkOff = this.isInvulnerable && Math.floor(shieldTime * 10) % 2 === 0;
    ctx.fillStyle = blinkOff ? 'rgba(79, 195, 247, 0.33)' : '#4fc3f7';
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - this.h / 2);
    ctx.lineTo(this.x + this.w / 2, this.y + this.h / 2);
    ctx.lineTo(this.x - this.w / 2, this.y + this.h / 2);
    ctx.closePath();
    ctx.fill();
    if (this.downedTimer > 0) {
      ctx.restore();
      ctx.fillStyle = '#ffcf6e';
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`AUXILIO ${Math.ceil(this.downedTimer)}s`, this.x, this.y - this.h / 2 - 5);
    }
  }
}