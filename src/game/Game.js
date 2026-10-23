import { C } from '../core/constants.js';
import { boxesOverlap } from '../core/collision.js';
import { Boss } from './Boss.js';
import { BonusStage } from './BonusStage.js';
import { Bullet } from './Bullet.js';
import { Formation } from './Formation.js';
import { Player } from './Player.js';
import { Starfield } from './Starfield.js';
import { asteroidOverlapsBox, Hazards } from './Hazards.js';
import { NoopEffects } from './Effects.js';
import { NoopSyncGateway } from './SyncGateway.js';
import {
  POWER_UP_DROP_CHANCE,
  POWER_UPS,
  POWER_UP_TYPES,
  STANDARD_POWER_UP_TYPES,
} from './powerUps.js';

const KILL_EFFECT_DURATION = 0.24;
const KILL_EFFECT_PARTICLES = 6;
const KILL_EFFECT_SPEED = 54;
const POWER_UP_FALL_SPEED = 90;
const BOSS_SCORE_REWARD = 100;
const BONUS_SHIP_SCORE = 50;
const BONUS_POWER_UP_DROP_CHANCE = 0.3;

function drawPowerUpGlyph(ctx, type, x, y, size) {
  const scale = size / 16;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = '#07101c';
  ctx.fillStyle = '#07101c';
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (type === 'shield') {
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(8, -7);
    ctx.lineTo(7, 1);
    ctx.quadraticCurveTo(5, 7, 0, 10);
    ctx.quadraticCurveTo(-5, 7, -7, 1);
    ctx.lineTo(-8, -7);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-3, 0);
    ctx.lineTo(-1, 3);
    ctx.lineTo(4, -3);
    ctx.stroke();
  } else if (type === 'rapidFire' || type === 'overdrive') {
    ctx.beginPath();
    ctx.moveTo(2, -10);
    ctx.lineTo(-6, 1);
    ctx.lineTo(-1, 1);
    ctx.lineTo(-3, 10);
    ctx.lineTo(6, -2);
    ctx.lineTo(1, -2);
    ctx.closePath();
    ctx.fill();
  } else {
    for (const offset of [-5, 0, 5]) {
      ctx.beginPath();
      ctx.moveTo(offset, 7);
      ctx.lineTo(offset, -4);
      ctx.moveTo(offset - 2, -1);
      ctx.lineTo(offset, -5);
      ctx.lineTo(offset + 2, -1);
      ctx.stroke();
    }
  }

  ctx.restore();
}

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
   *   effects?: import('./Effects.js').Effects,
   *   starsRandom?: () => number,
   *   hazardsRandom?: () => number,
   *   onGameOver?: (result: { mode: string, score: number, wave: number, durationSeconds: number }) => void,
   * }} [opts]
   *   `random` debe devolver un número en [0, 1). Se inyecta para poder probar.
   *   `sync` es el puerto de red; por defecto no hace nada (modo individual).
   *   `effects` es el puerto de sonido y vibración; por defecto es silencioso.
   *   `starsRandom` alimenta solo el fondo de estrellas; es independiente de `random`
   *   para que la decoración no altere la secuencia de azar de la partida.
   */
  constructor({
    width = C.WIDTH,
    height = C.HEIGHT,
    random = Math.random,
    sync = new NoopSyncGateway(),
    effects = new NoopEffects(),
    starsRandom = Math.random,
    hazardsRandom = Math.random,
    onGameOver = () => {},
  } = {}) {
    this.width = width;
    this.height = height;
    this.random = random;
    this.sync = sync;
    this.effects = effects;
    this.onGameOver = onGameOver;
    this.starfield = new Starfield({ width, height, random: starsRandom });
    this.hazardsRandom = hazardsRandom;
    this.startNewGame();
    this.#registerSyncHandlers();
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
    this.paused = false;
    this.boss = null;
    this.bonusStage = null;
    this.pendingBonusStage = false;
    this.bossRewardTimer = 0;
    /** @type {import('./Bullet.js').Bullet[]} */
    this.bullets = [];
    this.killEffects = [];
    this.synergyEffects = [];
    this.powerUps = [];
    this.hazards = new Hazards(this, this.hazardsRandom);
    this.player = new Player(this);
    this.remotePlayer = this.sync.isCoop
      ? {
          uid: this.sync.remoteUid,
          x: this.width * 0.72,
          y: this.height - C.PLAYER_BOTTOM_MARGIN,
          w: C.PLAYER_WIDTH,
          h: C.PLAYER_HEIGHT,
          downedTimer: 0,
          eliminated: false,
          revivePending: false,
        }
      : null;
    if (this.sync.isCoop && typeof this.sync.isHost === 'boolean') {
      this.player.x = this.sync.isHost ? this.width * 0.35 : this.width * 0.65;
      this.remotePlayer.x = this.sync.isHost ? this.width * 0.65 : this.width * 0.35;
    }
    this.#nextWave();
  }

  setSyncGateway(sync) {
    this.sync = sync;
    this.#registerSyncHandlers();
  }

  #registerSyncHandlers() {
    this.sync.setHandlers?.({
      onEvent: (_eventId, event) => this.#applyRemoteEvent(event),
    });
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
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.effects.gameOver();
    this.onGameOver({
      mode: this.sync.isCoop ? 'coop' : 'solo',
      score: this.score,
      wave: this.wave,
      durationSeconds: this.elapsed,
    });
  }

  /**
   * Congela la simulación (p. ej. la app pasa a segundo plano).
   * No hace nada tras el Game Over ni en coop, donde el reloj es el del servidor.
   */
  pause() {
    if (this.isGameOver || this.sync.isCoop) return;
    this.paused = true;
  }

  /** Reanuda una partida pausada. */
  resume() {
    this.paused = false;
  }

  /** Libera el gateway de red; llamar al abandonar la partida. */
  dispose() {
    this.sync.dispose();
  }

  /** @param {number} dt Segundos desde el frame anterior. */
  update(dt) {
    if (this.paused) return;

    this.#updateKillEffects(dt);
    if (this.isGameOver) return;

    this.elapsed += dt;
    this.bossRewardTimer = Math.max(0, this.bossRewardTimer - dt);
    this.starfield.update(dt);
    this.player.update(dt);
    this.sync.publishPlayerX(this.player.x / this.width);
    this.#updateRemotePlayer(dt);
    this.hazards.update(dt);
    this.bonusStage?.update(dt);
    if (this.boss) this.boss.update(dt);
    else if (!this.bonusStage) this.formation.update(dt);
    const magneticCenter = this.hazards.magneticCenter;
    for (const bullet of this.bullets) {
      if (
        magneticCenter !== null
        && bullet.fromPlayer
        && Math.abs(bullet.x - magneticCenter) < 110
      ) {
        bullet.vx = Math.max(-130, Math.min(130, bullet.vx + (magneticCenter - bullet.x) * 1.8 * dt));
      }
      bullet.update(dt, this.height);
    }

    this.#resolveSynergyShots();
    this.#resolveCollisions();
    this.#resolveAsteroidCollisions();
    this.hazards.asteroids = this.hazards.asteroids.filter((asteroid) => !asteroid.dead);
    this.#updatePowerUps(dt);
    this.bullets = this.bullets.filter((b) => !b.dead);

    if (this.isGameOver) return;
    if (this.boss?.health <= 0) {
      this.#defeatBoss();
      return;
    }
    if (this.boss) return;
    if (this.bonusStage) {
      if (this.bonusStage.remaining <= 0) {
        this.bonusStage = null;
        this.#nextWave();
      }
      return;
    }

    const alive = this.formation.alive;
    if (alive.length === 0) {
      this.score += C.WAVE_BONUS_MULTIPLIER * this.wave;
      this.pendingBonusStage = this.wave % 5 === 0;
      if (this.wave % 3 === 0) this.boss = new Boss(this, this.wave);
      else if (this.pendingBonusStage) this.#startBonusStage();
      else this.#nextWave();
      return;
    }

    const lineY = this.playerLineY;
    if (alive.some((e) => e.type !== 'kamikaze' && e.y + e.h / 2 >= lineY)) {
      this.triggerGameOver();
    }
  }

  #updateRemotePlayer(dt) {
    if (!this.remotePlayer) return;
    this.remotePlayer.uid = this.sync.remoteUid;
    const remoteX = this.sync.remoteX;
    if (Number.isFinite(remoteX)) {
      this.remotePlayer.x = Math.max(
        this.remotePlayer.w / 2,
        Math.min(this.width - this.remotePlayer.w / 2, remoteX * this.width),
      );
    }
    this.remotePlayer.downedTimer = Math.max(0, this.remotePlayer.downedTimer - dt);
    if (
      this.remotePlayer.downedTimer > 0
      && !this.player.downedTimer
      && !this.player.eliminated
      && this.lives > 0
      && Math.abs(this.player.x - this.remotePlayer.x) <= this.player.w
      && !this.remotePlayer.revivePending
    ) {
      this.#reviveRemotePlayer();
    }
  }

  expireDownedPlayer() {
    if (!this.sync.isCoop || this.player.eliminated) return;
    const consumedLife = this.lives > 0;
    if (consumedLife) this.lives -= 1;
    this.player.eliminated = true;
    this.sync.emitLifeLoss(this.elapsed, consumedLife);
    this.#checkCoopGameOver();
  }

  #reviveRemotePlayer() {
    if (
      !this.remotePlayer
      || !this.remotePlayer.uid
      || this.lives <= 0
      || this.remotePlayer.eliminated
    ) return;
    this.remotePlayer.revivePending = true;
    this.remotePlayer.downedTimer = 0;
    this.lives -= 1;
    this.sync.emitRevive(this.remotePlayer.uid, this.elapsed);
  }

  #checkCoopGameOver() {
    if (this.player.eliminated && this.remotePlayer?.eliminated) this.triggerGameOver();
  }

  #applyRemoteEvent(event) {
    if (!event || !this.sync.isCoop) return;
    if (event.type === 'shot' && Number.isFinite(event.x)) {
      const x = event.x * this.width;
      this.bullets.push(new Bullet({
        x,
        y: (this.remotePlayer?.y ?? this.player.y) - this.player.h / 2,
        fromPlayer: true,
        vy: -C.PLAYER_BULLET_SPEED,
        vx: Number.isFinite(event.vx) ? event.vx : 0,
        damage: Number.isFinite(event.damage) ? event.damage : 1,
        ownerUid: event.uid,
      }));
      return;
    }

    if (
      event.type === 'enemy-shot'
      && Number.isFinite(event.x)
      && Number.isFinite(event.y)
      && Number.isFinite(event.vy)
    ) {
      this.bullets.push(new Bullet({
        x: event.x * this.width,
        y: event.y * this.height,
        fromPlayer: false,
        vx: Number.isFinite(event.vx) ? event.vx : 0,
        vy: event.vy,
        color: typeof event.color === 'string' ? event.color : undefined,
      }));
      return;
    }

    if (event.type === 'kill' && event.wave === this.wave) {
      const enemy = this.formation.enemies.find((candidate) => candidate.id === event.enemyId);
      if (!enemy || enemy.dead) return;
      enemy.dead = true;
      this.score += C.SCORE_PER_ENEMY;
      this.killEffects.push({ x: enemy.x, y: enemy.y, color: enemy.color, age: 0 });
      if (POWER_UP_TYPES.includes(event.powerUpType)) {
        this.powerUps.push({
          type: event.powerUpType,
          x: enemy.x,
          y: enemy.y,
          w: 16,
          h: 16,
        });
      }
      return;
    }

    if (event.type === 'bonus-kill' && event.wave === this.wave && this.bonusStage) {
      const ship = this.bonusStage.ships.find((candidate) => candidate.id === event.shipId);
      if (ship?.dead) return;
      if (ship) ship.dead = true;
      const multiplier = Number.isFinite(event.multiplier)
        ? Math.max(1, Math.min(5, event.multiplier))
        : 1;
      this.score += BONUS_SHIP_SCORE * multiplier;
      this.bonusStage.combo = Math.max(
        this.bonusStage.combo,
        (multiplier - 1) * 3 + 1,
      );
      this.bonusStage.comboTimer = 1.8;
      if (POWER_UP_TYPES.includes(event.powerUpType)) {
        this.powerUps.push({
          type: event.powerUpType,
          x: ship?.x ?? this.width / 2,
          y: ship?.y ?? 150,
          w: 16,
          h: 16,
        });
      }
      return;
    }

    if (!this.remotePlayer) return;
    if (event.type === 'hit') {
      this.remotePlayer.downedTimer = 5;
      this.remotePlayer.revivePending = false;
      return;
    }
    if (event.type === 'revive' && event.targetUid === this.sync.uid) {
      if (this.player.revive()) this.lives = Math.max(0, this.lives - 1);
      this.remotePlayer.downedTimer = 0;
      this.remotePlayer.revivePending = false;
      return;
    }
    if (event.type === 'revive') {
      this.remotePlayer.downedTimer = 0;
      this.remotePlayer.revivePending = false;
      this.lives = Math.max(0, this.lives - 1);
      return;
    }
    if (event.type === 'life-loss') {
      if (event.consumedLife === true) this.lives = Math.max(0, this.lives - 1);
      this.remotePlayer.downedTimer = 0;
      this.remotePlayer.eliminated = true;
      this.remotePlayer.revivePending = false;
      this.#checkCoopGameOver();
    }
  }

  #resolveCollisions() {
    for (const bullet of this.bullets) {
      if (bullet.dead) continue;

      if (bullet.fromPlayer) {
        if (this.bonusStage) {
          const ship = this.bonusStage.ships.find(
            (candidate) => !candidate.dead && boxesOverlap(bullet, candidate),
          );
          if (ship) {
            this.#defeatBonusShip(ship);
            bullet.dead = true;
            continue;
          }
        }

        if (
          this.boss?.support
          && !this.boss.support.dead
          && boxesOverlap(bullet, this.boss.support)
        ) {
          this.boss.support.hp -= 1;
          if (this.boss.support.hp <= 0) {
            this.boss.support.dead = true;
            this.killEffects.push({
              x: this.boss.support.x,
              y: this.boss.support.y,
              color: '#68f0d2',
              age: 0,
            });
          }
          bullet.dead = true;
          continue;
        }

        if (this.boss && boxesOverlap(bullet, this.boss)) {
          this.boss.hit(bullet.damage);
          bullet.dead = true;
          continue;
        }

        if (this.bonusStage) {
          bullet.dead = true;
          continue;
        }

        const enemies = this.formation.alive;
        for (const enemy of enemies) {
          if (enemy.dead || !boxesOverlap(bullet, enemy)) continue;
          if (enemy.hit(bullet.damage)) {
            this.#defeatEnemy(enemy);
          }
          bullet.dead = true;
          break;
        }
      } else if (boxesOverlap(bullet, this.player)) {
        this.player.hit();
        bullet.dead = true;
      }
    }

    for (const enemy of this.formation.alive) {
      if (enemy.type !== 'kamikaze' || !enemy.diving) continue;
      if (boxesOverlap(enemy, this.player)) {
        this.player.hit();
        enemy.dead = true;
      }
    }
  }

  #resolveSynergyShots() {
    if (!this.remotePlayer) return;
    const friendlyShots = this.bullets.filter(
      (bullet) => bullet.fromPlayer && !bullet.dead && bullet.ownerUid,
    );

    for (let firstIndex = 0; firstIndex < friendlyShots.length; firstIndex += 1) {
      const first = friendlyShots[firstIndex];
      if (first.dead) continue;
      for (let secondIndex = firstIndex + 1; secondIndex < friendlyShots.length; secondIndex += 1) {
        const second = friendlyShots[secondIndex];
        if (
          second.dead
          || first.ownerUid === second.ownerUid
          || !boxesOverlap(first, second)
        ) continue;

        first.dead = true;
        second.dead = true;
        const x = (first.x + second.x) / 2;
        const y = (first.y + second.y) / 2;
        this.synergyEffects.push({ x, y, age: 0 });

        if (this.boss && Math.hypot(this.boss.x - x, this.boss.y - y) <= 64) {
          this.boss.hit(4);
        }
        for (const enemy of this.formation.alive) {
          if (Math.hypot(enemy.x - x, enemy.y - y) > 64) continue;
          if (enemy.hit(4)) this.#defeatEnemy(enemy);
        }
        if (this.bonusStage) {
          for (const ship of this.bonusStage.ships) {
            if (Math.hypot(ship.x - x, ship.y - y) <= 64 && !ship.dead) {
              this.#defeatBonusShip(ship);
            }
          }
        }
        this.effects.kill();
        break;
      }
    }
  }

  #defeatEnemy(enemy, { scoreMultiplier = 1, dropChance = POWER_UP_DROP_CHANCE } = {}) {
    this.score += C.SCORE_PER_ENEMY * scoreMultiplier;
    this.effects.kill();
    this.killEffects.push({
      x: enemy.x,
      y: enemy.y,
      color: enemy.color,
      age: 0,
    });
    const powerUpType = this.#dropPowerUp(
      enemy.x,
      enemy.y,
      dropChance,
      STANDARD_POWER_UP_TYPES,
    );
    this.sync.emitKill(this.wave, enemy.id, this.elapsed, powerUpType);
  }

  #defeatBonusShip(ship) {
    if (ship.dead || !this.bonusStage) return;
    ship.dead = true;
    const multiplier = this.bonusStage.registerKill();
    this.score += BONUS_SHIP_SCORE * multiplier;
    this.effects.kill();
    this.killEffects.push({
      x: ship.x,
      y: ship.y,
      color: '#ffd166',
      age: 0,
    });
    const powerUpType = this.#dropPowerUp(
      ship.x,
      ship.y,
      BONUS_POWER_UP_DROP_CHANCE,
      POWER_UP_TYPES,
    );
    this.sync.emitBonusKill(
      this.wave,
      ship.id,
      multiplier,
      this.elapsed,
      powerUpType,
    );
  }

  #dropPowerUp(x, y, dropChance, types) {
    if (this.random() >= dropChance) return null;
    const type = types[Math.floor(this.random() * types.length)];
    this.powerUps.push({ type, x, y, w: 16, h: 16 });
    return type;
  }

  #startBonusStage() {
    this.bonusStage = new BonusStage(this);
    this.pendingBonusStage = false;
  }

  #resolveAsteroidCollisions() {
    for (const asteroid of this.hazards.asteroids) {
      if (asteroid.dead) continue;
      if (asteroidOverlapsBox(asteroid, this.player)) {
        this.player.hit();
        asteroid.dead = true;
        continue;
      }

      const enemy = this.formation.alive.find((candidate) =>
        asteroidOverlapsBox(asteroid, candidate));
      if (enemy) {
        enemy.hp = 1;
        if (enemy.hit()) this.#defeatEnemy(enemy);
        asteroid.dead = true;
      }
    }
  }

  #defeatBoss() {
    const { x, y, color, level } = this.boss;
    this.boss = null;
    this.killEffects.push({ x, y, color, age: 0 });
    this.lives += 1;
    this.score += BOSS_SCORE_REWARD * level;
    this.bossRewardTimer = 3.5;
    this.bullets = this.bullets.filter((bullet) => bullet.fromPlayer);

    const powerUpTypes = [...STANDARD_POWER_UP_TYPES];
    const firstIndex = Math.floor(this.random() * powerUpTypes.length);
    const [first] = powerUpTypes.splice(firstIndex, 1);
    const secondIndex = Math.floor(this.random() * powerUpTypes.length);
    this.player.activatePowerUp(first);
    this.player.activatePowerUp(powerUpTypes[secondIndex]);
    if (this.pendingBonusStage) this.#startBonusStage();
    else this.#nextWave();
  }

  #updatePowerUps(dt) {
    for (const powerUp of this.powerUps) {
      powerUp.y += POWER_UP_FALL_SPEED * dt;
      if (boxesOverlap(powerUp, this.player)) {
        this.player.activatePowerUp(powerUp.type);
        powerUp.collected = true;
      }
    }
    this.powerUps = this.powerUps.filter(
      (powerUp) => !powerUp.collected && powerUp.y < this.height + powerUp.h,
    );
  }

  #updateKillEffects(dt) {
    for (const effect of this.killEffects) effect.age += dt;
    this.killEffects = this.killEffects.filter((effect) => effect.age < KILL_EFFECT_DURATION);
    for (const effect of this.synergyEffects) effect.age += dt;
    this.synergyEffects = this.synergyEffects.filter((effect) => effect.age < 0.38);
  }

  /** @param {CanvasRenderingContext2D} ctx */
  render(ctx) {
    const darkness = this.hazards.active?.type === 'darkness';
    ctx.fillStyle = darkness ? '#000000' : '#0b0e1a';
    ctx.fillRect(0, 0, this.width, this.height);

    if (!darkness) this.starfield.render(ctx);
    this.#renderHazards(ctx);
    if (darkness) {
      ctx.save();
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#8bd5ff';
    }
    for (const enemy of this.formation.alive) enemy.render(ctx);
    if (this.bonusStage) this.#renderBonusShips(ctx);
    if (this.boss) this.boss.render(ctx);
    this.#renderKillEffects(ctx);
    this.#renderPowerUps(ctx);
    for (const bullet of this.bullets) bullet.render(ctx);
    this.player.render(ctx);
    this.#renderRemotePlayer(ctx);
    this.#renderSynergyEffects(ctx);
    if (darkness) ctx.restore();

    this.#renderHud(ctx);
    if (this.boss) this.boss.renderHealthBar(ctx, this.width);
    if (this.isGameOver) this.#renderGameOver(ctx);
    else if (this.paused) this.#renderPaused(ctx);
  }

  #renderRemotePlayer(ctx) {
    if (!this.remotePlayer || this.remotePlayer.eliminated) return;
    ctx.save();
    if (this.remotePlayer.downedTimer > 0) {
      ctx.globalAlpha = 0.38 + Math.sin(this.elapsed * 10) * 0.12;
    }
    ctx.fillStyle = '#d68bff';
    ctx.beginPath();
    ctx.moveTo(this.remotePlayer.x, this.remotePlayer.y - this.remotePlayer.h / 2);
    ctx.lineTo(
      this.remotePlayer.x + this.remotePlayer.w / 2,
      this.remotePlayer.y + this.remotePlayer.h / 2,
    );
    ctx.lineTo(
      this.remotePlayer.x - this.remotePlayer.w / 2,
      this.remotePlayer.y + this.remotePlayer.h / 2,
    );
    ctx.closePath();
    ctx.fill();
    if (this.remotePlayer.downedTimer > 0) {
      ctx.fillStyle = '#ffcf6e';
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(
        `AUXILIO ${Math.ceil(this.remotePlayer.downedTimer)}s`,
        this.remotePlayer.x,
        this.remotePlayer.y - this.remotePlayer.h / 2 - 5,
      );
    }
    ctx.restore();
  }

  #renderSynergyEffects(ctx) {
    for (const effect of this.synergyEffects) {
      const progress = effect.age / 0.38;
      ctx.save();
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = '#f6a8ff';
      ctx.shadowColor = '#da78ff';
      ctx.shadowBlur = 16;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 10 + progress * 54, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  #renderBonusShips(ctx) {
    for (const ship of this.bonusStage.ships) {
      ctx.save();
      ctx.translate(ship.x, ship.y);
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(-ship.w / 2, 0);
      ctx.lineTo(-ship.w / 4, -ship.h / 2);
      ctx.lineTo(ship.w / 2, -ship.h / 3);
      ctx.lineTo(ship.w / 3, ship.h / 2);
      ctx.lineTo(-ship.w / 3, ship.h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff3c4';
      ctx.fillRect(-2, -2, 4, 4);
      ctx.restore();
    }
  }

  #renderHazards(ctx) {
    if (this.hazards.active?.type === 'magnetic') {
      const center = this.hazards.magneticCenter;
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#57a8ff';
      ctx.beginPath();
      ctx.ellipse(center, this.height * 0.48, 94, this.height * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = '#8bd5ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(center, this.height * 0.48, 94, this.height * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const asteroid of this.hazards.asteroids) {
      ctx.save();
      ctx.translate(asteroid.x, asteroid.y);
      ctx.rotate(asteroid.rotation);
      ctx.fillStyle = '#9b7051';
      ctx.strokeStyle = '#e7a66d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let vertex = 0; vertex < 8; vertex += 1) {
        const angle = (Math.PI * 2 * vertex) / 8;
        const irregularRadius = asteroid.radius * (vertex % 2 === 0 ? 1 : 0.76);
        const x = Math.cos(angle) * irregularRadius;
        const y = Math.sin(angle) * irregularRadius;
        if (vertex === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  #renderKillEffects(ctx) {
    for (const effect of this.killEffects) {
      const progress = effect.age / KILL_EFFECT_DURATION;
      const distance = progress * KILL_EFFECT_SPEED;
      const size = Math.max(1, 4 * (1 - progress));
      ctx.fillStyle = effect.color;
      ctx.globalAlpha = 1 - progress;

      for (let index = 0; index < KILL_EFFECT_PARTICLES; index += 1) {
        const angle = (Math.PI * 2 * index) / KILL_EFFECT_PARTICLES;
        ctx.fillRect(
          effect.x + Math.cos(angle) * distance - size / 2,
          effect.y + Math.sin(angle) * distance - size / 2,
          size,
          size,
        );
      }

      if (progress < 0.35) {
        ctx.globalAlpha = 1 - progress / 0.35;
        ctx.fillRect(effect.x - 2, effect.y - 2, 4, 4);
      }
    }
    ctx.globalAlpha = 1;
  }

  #renderPowerUps(ctx) {
    for (const powerUp of this.powerUps) {
      const definition = POWER_UPS[powerUp.type];
      const bob = Math.sin(this.elapsed * 4 + powerUp.x * 0.08) * 2;
      const x = powerUp.x;
      const y = powerUp.y + bob;
      const rotation = Math.sin(this.elapsed * 2.5 + powerUp.x * 0.04) * 0.12;
      const pulse = 1 + Math.sin(this.elapsed * 6 + powerUp.y * 0.03) * 0.06;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.scale(pulse, pulse);
      ctx.shadowColor = definition.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#07101c';
      ctx.strokeStyle = definition.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let vertex = 0; vertex < 8; vertex += 1) {
        const angle = (Math.PI * 2 * vertex) / 8 - Math.PI / 2;
        const radius = vertex % 2 === 0 ? 15 : 12;
        const pointX = Math.cos(angle) * radius;
        const pointY = Math.sin(angle) * radius;
        if (vertex === 0) ctx.moveTo(pointX, pointY);
        else ctx.lineTo(pointX, pointY);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = definition.color;
      ctx.beginPath();
      ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
      ctx.fill();
      drawPowerUpGlyph(ctx, powerUp.type, 0, 0, 13);
      ctx.restore();

      const glint = Math.sin(this.elapsed * 8 + powerUp.x) > 0.8;
      if (glint) {
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 10, y - 13, 2, 2);
        ctx.fillRect(x - 13, y + 9, 2, 2);
        ctx.restore();
      }
    }
  }

  #renderHud(ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(`Puntos: ${this.score}`, 12, 12);
    ctx.textAlign = 'center';
    ctx.fillText(`Vidas: ${this.lives}`, this.width / 2, 12);
    ctx.textAlign = 'right';
    ctx.fillText(`Oleada: ${this.wave}`, this.width - 12, 12);

    if (this.hazards.active) {
      const labels = {
        asteroids: 'LLUVIA DE ASTEROIDES',
        magnetic: 'CAMPO MAGNÉTICO',
        darkness: 'MODO OSCURIDAD',
      };
      ctx.fillStyle = this.hazards.active.type === 'asteroids' ? '#ffb36c' : '#8bd5ff';
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(
        `${labels[this.hazards.active.type]} · ${Math.ceil(this.hazards.active.remaining)}s`,
        this.width / 2,
        32,
      );
    }

    if (this.bossRewardTimer > 0) {
      ctx.fillStyle = '#ffd274';
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('+1 VIDA · 2 POTENCIADORES', this.width / 2, this.boss ? 60 : 34);
    }

    if (this.bonusStage) {
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const combo = this.bonusStage.combo >= 3
        ? ` · COMBO x${Math.min(5, 1 + Math.floor((this.bonusStage.combo - 1) / 3))}`
        : '';
      ctx.fillText(
        `FASE BONUS · ${Math.ceil(this.bonusStage.remaining)}s${combo}`,
        this.width / 2,
        this.hazards.active ? 46 : 32,
      );
    }

    const activePowerUps = [
      ['shield', this.player.shieldPowerUp],
      ['rapidFire', this.player.rapidFire],
      ['tripleShot', this.player.tripleShot],
      ['overdrive', this.player.overdrive],
    ].filter(([, remaining]) => remaining > 0);
    if (activePowerUps.length > 0) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = 'bold 11px ui-monospace, monospace';
      activePowerUps.forEach(([type, remaining], index) => {
        const definition = POWER_UPS[type];
        ctx.fillStyle = definition.color;
        const offset = this.bossRewardTimer > 0 ? 16 : 0;
        ctx.fillText(
          `${definition.label} ${remaining.toFixed(1)}s`,
          this.width / 2,
          34 + offset + index * 15,
        );
      });
    }
  }

  #renderPaused(ctx) {
    ctx.fillStyle = 'rgba(11, 14, 26, 0.6)';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PAUSA', this.width / 2, this.height / 2 - 12);

    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('Toca para continuar', this.width / 2, this.height / 2 + 24);
  }

  #renderGameOver(ctx) {
    ctx.fillStyle = 'rgba(11, 14, 26, 0.6)';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd21a';
    ctx.font = 'bold 38px system-ui, sans-serif';
    ctx.fillText('GAME OVER', this.width / 2, this.height / 2 - 30);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(`Puntaje: ${this.score}`, this.width / 2, this.height / 2 + 16);

    ctx.fillStyle = '#aeb8c9';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('Preparando resultados…', this.width / 2, this.height / 2 + 56);
  }
}