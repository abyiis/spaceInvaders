import { C } from '../core/constants.js';
import { createHostLedger } from '../core/hostLedger.js';
import { STREAM_SALT, streamFor } from '../core/prng.js';
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
/** Paso de la simulación coop atada al reloj del servidor (`multiplayer_sync.md` §2). */
const FIXED_STEP = 1 / 60;
const MAX_CATCH_UP_STEPS = 30;
/** Tope de la compensación de latencia al recrear disparos remotos (s). */
const MAX_EVENT_LAG = 0.25;

/**
 * Dibuja un ícono pixel-art retro para el power-up dado.
 * Cada pixel se dibuja en cuadrícula para una estética arcade 8-bit.
 */
function drawPowerUpGlyph(ctx, type, x, y, size) {
  const px = Math.max(1, Math.round(size / 8));
  ctx.save();
  ctx.translate(x, y);

  const dot = (col, row) => ctx.fillRect(col * px - px / 2, row * px - px / 2, px, px);

  ctx.fillStyle = '#07101c';

  if (type === 'shield') {
    // Escudo pixel art: contorno y núcleo
    for (const [c, r] of [
      [-2,-3],[-1,-3],[0,-3],[1,-3],[2,-3],
      [-3,-2],[3,-2], [-3,-1],[3,-1], [-3,0],[3,0],
      [-2,1],[2,1], [-1,2],[0,2],[1,2],
      [-1,0],[0,1],[1,-1],
    ]) dot(c, r);
  } else if (type === 'rapidFire') {
    // Rayo zigzag pixel art
    for (const [c, r] of [
      [1,-3],[0,-2],[-1,-1],[0,-1],[-1,0],[-2,1],[-1,2],[0,2],[1,2],
      [0,1],[1,0],[0,0],
    ]) dot(c, r);
  } else if (type === 'overdrive') {
    // Doble rayo enérgico pixel art
    for (const [c, r] of [
      [-1,-3],[0,-2],[-2,-1],[-1,-1],[-2,0],[-3,1],[-2,2],[-1,2],
      [2,-3],[3,-2],[1,-1],[2,-1],[1,0],[0,1],[1,2],[2,2],
    ]) dot(c, r);
  } else {
    // tripleShot: tres flechas de disparo arcade
    for (const [c, r] of [
      [-3,-2],[-4,-1],[-3,-1],[-2,-1],[-3,0],[-3,1],
      [0,-3],[-1,-2],[0,-2],[1,-2],[0,-1],[0,0],[0,1],
      [3,-2],[2,-1],[3,-1],[4,-1],[3,0],[3,1],
    ]) dot(c, r);
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
    this.#assignSeed();
    /** Bajas y puntos por jugador; el del host es el oficial (`multiplayer_sync.md` §4.3). */
    this.ledger = createHostLedger();
    /** Segundos que faltan para empezar la partida coop; 0 una vez en marcha. */
    this.countdown = 0;
    /** `true` mientras un cliente coop espera conocer el reloj del servidor. */
    this.syncingClock = false;
    this.boss = null;
    this.bonusStage = null;
    this.pendingBonusStage = false;
    this.bossDefeatedPending = false;
    this.bossRewardTimer = 0;
    /** @type {import('./Bullet.js').Bullet[]} */
    this.bullets = [];
    this.killEffects = [];
    this.synergyEffects = [];
    this.powerUps = [];
    this.hazards = new Hazards(
      this,
      this.sync.isCoop ? streamFor(this.seed, STREAM_SALT.HAZARDS) : this.hazardsRandom,
    );
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

  /**
   * Semilla de la partida: la de la sala en coop (todo lo sincronizado deriva de ella) y una
   * nueva en cada partida en solitario.
   */
  #assignSeed() {
    const shared = this.sync.isCoop ? this.sync.seed : undefined;
    this.seed = Number.isSafeInteger(shared)
      ? shared >>> 0
      : Math.floor(this.random() * 4294967296) >>> 0;
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

  /** @param {{ startElapsed?: number }} [options] Tiempo de juego en que arranca la oleada. */
  #nextWave({ startElapsed = this.elapsed } = {}) {
    this.wave += 1;
    this.ledger.startWave(this.wave);
    this.formation = new Formation(this, this.wave, { startElapsed });
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
    this.#finishGame({ announce: true });
  }

  /**
   * @param {{ announce: boolean, official?: { score?: number, wave?: number } | null }} options
   *   `announce`: el host avisa al compañero. `official`: valores del host que adopta el compañero.
   */
  #finishGame({ announce, official = null }) {
    if (this.isGameOver) return;
    if (Number.isFinite(official?.score)) this.score = Math.max(0, Math.floor(official.score));
    if (Number.isFinite(official?.wave)) this.wave = Math.max(this.wave, Math.floor(official.wave));
    this.isGameOver = true;
    if (announce && this.sync.isCoop && this.isAuthority) {
      this.sync.emitGameOver(this.elapsed, this.score, this.wave, this.ledger.killsBy());
    }
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
    if (this.sync.isCoop && typeof this.sync.gameTime === 'function') {
      this.#updateLockedToServerClock(dt);
      return;
    }
    this.#step(dt);
  }

  /**
   * En coop el tiempo de juego es el del servidor: se avanza en pasos fijos hasta alcanzarlo,
   * de modo que ambos clientes recorren la misma secuencia de estados.
   */
  #updateLockedToServerClock(dt) {
    if (this.isGameOver) {
      this.#step(dt);
      return;
    }
    const target = this.sync.gameTime();
    this.syncingClock = target === null;
    if (target === null) return;
    if (target < 0) {
      this.countdown = -target;
      return;
    }
    this.countdown = 0;
    for (let steps = 0; steps < MAX_CATCH_UP_STEPS && !this.isGameOver; steps += 1) {
      const remaining = target - this.elapsed;
      if (remaining <= 1e-6) break;
      this.#step(remaining <= FIXED_STEP * 2 ? remaining : FIXED_STEP);
    }
  }

  /** Avanza la simulación `dt` segundos. */
  #step(dt) {
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

    // En coop el compañero no decide fases ni el final: espera los eventos del host.
    if (this.isGameOver || !this.isAuthority) return;
    if (this.boss?.health <= 0) {
      this.#defeatBoss();
      return;
    }
    if (this.boss) return;
    if (this.bonusStage) {
      if (this.bonusStage.remaining <= 0) {
        this.bonusStage = null;
        this.#enterWave();
      }
      return;
    }

    const alive = this.formation.alive;
    if (alive.length === 0) {
      this.#completeWave();
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
    this.#publishOfficialState();
    this.#checkCoopGameOver();
  }

  /** `true` si este cliente decide la partida: siempre en solo, el host en coop. */
  get isAuthority() {
    return !this.sync.isCoop || this.sync.isHost === true;
  }

  /** Los eventos del host solo valen si los firma el host actual. */
  #fromHost(event) {
    const hostUid = this.sync.hostUid;
    return hostUid == null || event.uid === hostUid;
  }

  /** El host publica las vidas oficiales; el compañero las adopta (`multiplayer_sync.md` §4.3). */
  #publishOfficialState() {
    if (!this.sync.isCoop || !this.isAuthority) return;
    this.sync.emitState(this.elapsed, this.score, this.lives, this.wave);
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
    this.#publishOfficialState();
  }

  #checkCoopGameOver() {
    if (!this.isAuthority) return;
    if (this.player.eliminated && this.remotePlayer?.eliminated) this.triggerGameOver();
  }

  /** Formación vencida: bonus de oleada y elección de la fase siguiente (solo la autoridad). */
  #completeWave() {
    this.score += C.WAVE_BONUS_MULTIPLIER * this.wave;
    this.pendingBonusStage = this.wave % 5 === 0;
    if (this.wave % 3 === 0) this.#enterBoss();
    else if (this.pendingBonusStage) this.#enterBonus();
    else this.#enterWave();
  }

  #enterBoss() {
    this.boss = new Boss(this, this.wave);
    this.#announcePhase('boss');
  }

  #enterBonus() {
    this.#startBonusStage();
    this.#announcePhase('bonus');
  }

  #enterWave() {
    this.#nextWave();
    this.#announcePhase('wave');
  }

  /** El host avisa de la transición con el puntaje y las vidas oficiales. */
  #announcePhase(kind) {
    const bossDefeated = this.bossDefeatedPending;
    this.bossDefeatedPending = false;
    if (!this.sync.isCoop || !this.isAuthority) return;
    this.sync.emitPhase({
      kind,
      wave: this.wave,
      t: this.elapsed,
      score: this.score,
      lives: this.lives,
      bossDefeated,
    });
  }

  /** El compañero sigue la transición anunciada por el host (`multiplayer_sync.md` §4.3). */
  #applyPhase(event) {
    if (this.isAuthority || this.isGameOver || !this.#fromHost(event)) return;
    if (!Number.isFinite(event.wave) || !Number.isFinite(event.t)) return;
    const wave = Math.floor(event.wave);
    const lag = this.#eventLag(event);

    if (event.kind === 'boss') {
      if (this.boss || wave < this.wave) return;
      this.#adoptOfficial(event);
      this.wave = wave;
      this.pendingBonusStage = wave % 5 === 0;
      this.boss = new Boss(this, wave);
      return;
    }
    if (event.kind === 'bonus') {
      if (this.bonusStage || wave < this.wave) return;
      this.#adoptOfficial(event);
      if (this.boss && event.bossDefeated) this.#celebrateBossDefeat();
      this.wave = wave;
      this.#startBonusStage();
      this.bonusStage.remaining = Math.max(0, this.bonusStage.remaining - lag);
      return;
    }
    if (event.kind === 'wave') {
      if (wave <= this.wave) return;
      this.#adoptOfficial(event);
      if (this.boss && event.bossDefeated) this.#celebrateBossDefeat();
      this.boss = null;
      this.bonusStage = null;
      this.wave = wave - 1;
      this.#nextWave({ startElapsed: event.t });
    }
  }

  #adoptOfficial(event) {
    if (Number.isFinite(event.score)) this.score = Math.max(0, Math.floor(event.score));
    if (Number.isFinite(event.lives)) this.lives = Math.max(0, Math.floor(event.lives));
  }

  #applyRemoteEvent(event) {
    if (!event || !this.sync.isCoop) return;
    if (event.type === 'shot' && Number.isFinite(event.x)) {
      const vx = Number.isFinite(event.vx) ? event.vx : 0;
      const vy = -C.PLAYER_BULLET_SPEED * (vx === 0 ? 1 : C.SIDE_SHOT_SPEED_FACTOR);
      // La bala nace donde estaría si el evento no hubiera tardado en llegar.
      const lag = this.#eventLag(event);
      this.bullets.push(new Bullet({
        x: event.x * this.width + vx * lag,
        y: (this.remotePlayer?.y ?? this.player.y) - this.player.h / 2 + vy * lag,
        fromPlayer: true,
        vy,
        vx,
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
      const vx = Number.isFinite(event.vx) ? event.vx : 0;
      const lag = this.#eventLag(event);
      this.bullets.push(new Bullet({
        x: event.x * this.width + vx * lag,
        y: event.y * this.height + event.vy * lag,
        fromPlayer: false,
        vx,
        vy: event.vy,
        color: typeof event.color === 'string' ? event.color : undefined,
      }));
      return;
    }

    if (event.type === 'kill' && event.wave === this.wave) {
      const enemy = this.formation.enemies.find((candidate) => candidate.id === event.enemyId);
      // El primer reclamo gana; si la baja ya estaba reclamada solo falta el potenciador.
      const first = this.ledger.claimKill(event.wave, event.enemyId, event.uid, C.SCORE_PER_ENEMY);
      if (enemy) this.#dropRemotePowerUp(event, enemy, `k:${event.wave}:${event.enemyId}`);
      if (!first || !enemy || enemy.dead) return;
      enemy.dead = true;
      this.score += C.SCORE_PER_ENEMY;
      this.killEffects.push({ x: enemy.x, y: enemy.y, color: enemy.color, age: 0 });
      return;
    }

    if (event.type === 'bonus-kill' && event.wave === this.wave && this.bonusStage) {
      const ship = this.bonusStage.ships.find((candidate) => candidate.id === event.shipId);
      const multiplier = Number.isFinite(event.multiplier)
        ? Math.max(1, Math.min(5, event.multiplier))
        : 1;
      const first = this.ledger.claimBonusKill(
        event.wave,
        event.shipId,
        event.uid,
        BONUS_SHIP_SCORE * multiplier,
      );
      this.#dropRemotePowerUp(
        event,
        { x: ship?.x ?? this.width / 2, y: ship?.y ?? 150 },
        `b:${event.wave}:${event.shipId}`,
      );
      if (!first || ship?.dead) return;
      if (ship) ship.dead = true;
      this.score += BONUS_SHIP_SCORE * multiplier;
      this.bonusStage.combo = Math.max(
        this.bonusStage.combo,
        (multiplier - 1) * 3 + 1,
      );
      this.bonusStage.comboTimer = 1.8;
      return;
    }

    if (event.type === 'phase') {
      this.#applyPhase(event);
      return;
    }

    if (event.type === 'game-over') {
      if (!this.isAuthority && this.#fromHost(event)) {
        this.#finishGame({ announce: false, official: event });
      }
      return;
    }

    if (event.type === 'state' && !this.isAuthority) {
      if (!this.#fromHost(event)) return;
      if (Number.isFinite(event.lives)) this.lives = Math.max(0, Math.floor(event.lives));
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
      this.#publishOfficialState();
      return;
    }
    if (event.type === 'life-loss') {
      if (event.consumedLife === true) this.lives = Math.max(0, this.lives - 1);
      this.remotePlayer.downedTimer = 0;
      this.remotePlayer.eliminated = true;
      this.remotePlayer.revivePending = false;
      this.#publishOfficialState();
      this.#checkCoopGameOver();
    }
  }

  /** Segundos de retraso de un evento remoto respecto del tiempo de juego local. */
  #eventLag(event) {
    if (!Number.isFinite(event.t)) return 0;
    return Math.max(0, Math.min(MAX_EVENT_LAG, this.elapsed - event.t));
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
            this.#defeatBonusShip(ship, bullet.ownerUid);
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

        const enemies = this.formation.alive;
        for (const enemy of enemies) {
          if (enemy.dead || !boxesOverlap(bullet, enemy)) continue;
          if (enemy.hit(bullet.damage)) {
            this.#defeatEnemy(enemy, { ownerUid: bullet.ownerUid });
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

  get #localUid() {
    return this.sync.uid ?? 'local';
  }

  /** `true` si `uid` es el compañero: sus bajas las reclama él mismo por evento. */
  #isRemoteUid(uid) {
    return this.sync.isCoop && uid != null && uid !== this.sync.uid;
  }

  /**
   * Baja de un enemigo en la simulación local. Si la bala era del compañero se aplica el efecto y
   * el puntaje de forma optimista, pero el reclamo y el potenciador los publica su dueño.
   */
  #defeatEnemy(enemy, { scoreMultiplier = 1, dropChance = POWER_UP_DROP_CHANCE, ownerUid = null } = {}) {
    const points = C.SCORE_PER_ENEMY * scoreMultiplier;
    this.ledger.claimKill(this.wave, enemy.id, ownerUid ?? this.#localUid, points);
    this.score += points;
    this.effects.kill();
    this.killEffects.push({
      x: enemy.x,
      y: enemy.y,
      color: enemy.color,
      age: 0,
    });
    if (this.#isRemoteUid(ownerUid)) return;
    const powerUpType = this.#dropPowerUp(
      enemy.x,
      enemy.y,
      dropChance,
      STANDARD_POWER_UP_TYPES,
    );
    if (powerUpType) this.ledger.markDrop(`k:${this.wave}:${enemy.id}`);
    this.sync.emitKill(this.wave, enemy.id, this.elapsed, powerUpType);
  }

  #defeatBonusShip(ship, ownerUid = null) {
    if (ship.dead || !this.bonusStage) return;
    ship.dead = true;
    const multiplier = this.bonusStage.registerKill();
    const points = BONUS_SHIP_SCORE * multiplier;
    this.ledger.claimBonusKill(this.wave, ship.id, ownerUid ?? this.#localUid, points);
    this.score += points;
    this.effects.kill();
    this.killEffects.push({
      x: ship.x,
      y: ship.y,
      color: '#ffd166',
      age: 0,
    });
    if (this.#isRemoteUid(ownerUid)) return;
    const powerUpType = this.#dropPowerUp(
      ship.x,
      ship.y,
      BONUS_POWER_UP_DROP_CHANCE,
      POWER_UP_TYPES,
    );
    if (powerUpType) this.ledger.markDrop(`b:${this.wave}:${ship.id}`);
    this.sync.emitBonusKill(
      this.wave,
      ship.id,
      multiplier,
      this.elapsed,
      powerUpType,
    );
  }

  /** Crea el potenciador que el compañero soltó al reclamar una baja (una sola vez por baja). */
  #dropRemotePowerUp(event, position, key) {
    if (!POWER_UP_TYPES.includes(event.powerUpType) || !this.ledger.markDrop(key)) return;
    this.powerUps.push({
      type: event.powerUpType,
      x: position.x,
      y: position.y,
      w: 16,
      h: 16,
    });
  }

  #dropPowerUp(x, y, dropChance, types) {
    if (this.random() >= dropChance) return null;
    const type = types[Math.floor(this.random() * types.length)];
    this.powerUps.push({ type, x, y, w: 16, h: 16 });
    return type;
  }

  #startBonusStage() {
    this.bonusStage = new BonusStage(this, {
      random: streamFor(this.seed, STREAM_SALT.BONUS_STAGE + this.wave),
    });
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

  /** Puntaje y vida del jefe (los decide la autoridad) más sus efectos y recompensas locales. */
  #defeatBoss() {
    const { level } = this.boss;
    this.lives += 1;
    this.score += BOSS_SCORE_REWARD * level;
    this.#celebrateBossDefeat();
    this.bossDefeatedPending = true;
    if (this.pendingBonusStage) this.#enterBonus();
    else this.#enterWave();
  }

  /** Lo que vive cada cliente al caer el jefe: estallido, aviso, balas fuera y dos potenciadores. */
  #celebrateBossDefeat() {
    const { x, y, color } = this.boss;
    this.boss = null;
    this.killEffects.push({ x, y, color, age: 0 });
    this.bossRewardTimer = 3.5;
    this.bullets = this.bullets.filter((bullet) => bullet.fromPlayer);

    const powerUpTypes = [...STANDARD_POWER_UP_TYPES];
    const firstIndex = Math.floor(this.random() * powerUpTypes.length);
    const [first] = powerUpTypes.splice(firstIndex, 1);
    const secondIndex = Math.floor(this.random() * powerUpTypes.length);
    this.player.activatePowerUp(first);
    this.player.activatePowerUp(powerUpTypes[secondIndex]);
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
    ctx.fillStyle = '#0b0e1a';
    ctx.fillRect(0, 0, this.width, this.height);

    this.starfield.render(ctx);
    this.#renderHazards(ctx);
    for (const enemy of this.formation.alive) enemy.render(ctx);
    if (this.bonusStage) this.#renderBonusShips(ctx);
    if (this.boss) this.boss.render(ctx);
    this.#renderKillEffects(ctx);
    this.#renderPowerUps(ctx);
    for (const bullet of this.bullets) bullet.render(ctx);
    this.player.render(ctx);
    this.#renderRemotePlayer(ctx);
    this.#renderSynergyEffects(ctx);

    this.#renderHud(ctx);
    if (this.boss) this.boss.renderHealthBar(ctx, this.width);
    if (this.syncingClock || this.countdown > 0) this.#renderCountdown(ctx);
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
      const age = this.hazards.active.age;
      const cx = center;
      const cy = this.height * 0.48;
      ctx.save();

      // Aura central con gradiente radial pulsante
      const pulseR = 84 + Math.sin(age * 2.5) * 10;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulseR * 1.3);
      grad.addColorStop(0, 'rgba(87, 168, 255, 0.24)');
      grad.addColorStop(0.5, 'rgba(80, 140, 255, 0.12)');
      grad.addColorStop(1, 'rgba(80, 140, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, pulseR * 1.3, this.height * 0.44, 0, 0, Math.PI * 2);
      ctx.fill();

      // Anillos orbitales animados inclinados
      for (let ring = 0; ring < 3; ring += 1) {
        const ringPhase = age * (1.2 + ring * 0.4) + ring * (Math.PI * 2 / 3);
        const rx = 58 + ring * 18 + Math.sin(ringPhase) * 6;
        const ry = (this.height * 0.18) + ring * 15;
        const tilt = ringPhase * 0.35;
        ctx.save();
        ctx.globalAlpha = 0.55 - ring * 0.12;
        ctx.strokeStyle = ring === 0 ? '#a8d8ff' : ring === 1 ? '#6ab8ff' : '#4494e8';
        ctx.lineWidth = 1.6 - ring * 0.3;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, tilt, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Partículas y chispas de energía rotando en el campo
      ctx.globalAlpha = 0.85;
      for (let p = 0; p < 8; p += 1) {
        const pAngle = age * 1.6 + (Math.PI * 2 * p) / 8;
        const pr = 62 + Math.sin(age * 2 + p) * 14;
        const px = cx + Math.cos(pAngle) * pr;
        const py = cy + Math.sin(pAngle) * pr * 0.28;
        const brightness = 0.4 + Math.sin(age * 3 + p * 1.3) * 0.4;
        ctx.fillStyle = `rgba(138, 213, 255, ${brightness.toFixed(2)})`;
        ctx.fillRect(px - 1, py - 1, 2, 2);
      }

      // Línea central de resonancia magnética punteada
      ctx.globalAlpha = 0.35 + Math.sin(age * 4) * 0.15;
      ctx.strokeStyle = '#c8e8ff';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.ellipse(cx, cy, 42 + Math.sin(age * 1.8) * 6, this.height * 0.12, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

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
      // Animación retro con saltos discretos de 2px
      const bob = Math.floor(this.elapsed * 3 + powerUp.x * 0.05) % 2 === 0 ? 0 : -2;
      const x = Math.round(powerUp.x);
      const y = Math.round(powerUp.y) + bob;
      const blink = Math.floor(this.elapsed * 5) % 2 === 0;

      ctx.save();
      ctx.translate(x, y);

      // Resplandor exterior retro
      ctx.shadowColor = definition.color;
      ctx.shadowBlur = blink ? 12 : 6;

      // Caja retro pixel-art: cuerpo oscuro sólido
      const S = 13;
      ctx.fillStyle = '#060e1c';
      ctx.fillRect(-S, -S, S * 2, S * 2);

      // Marco de color arcade
      ctx.shadowBlur = 0;
      ctx.strokeStyle = definition.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(-S + 1, -S + 1, S * 2 - 2, S * 2 - 2);

      // Esquinas pixeladas de alto contraste (estilo 8-bit)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-S + 2, -S + 2, 2, 2);
      ctx.fillRect(S - 4, -S + 2, 2, 2);
      ctx.fillRect(-S + 2, S - 4, 2, 2);
      ctx.fillRect(S - 4, S - 4, 2, 2);

      // Fondo del glifo en color de power-up
      ctx.fillStyle = definition.color;
      ctx.fillRect(-8, -8, 16, 16);

      // Ícono pixel-art centrado
      drawPowerUpGlyph(ctx, powerUp.type, 0, 0, 12);

      ctx.restore();

      // Chispas exteriores estilo retro arcade
      if (blink) {
        ctx.save();
        ctx.fillStyle = definition.color;
        ctx.globalAlpha = 0.7;
        ctx.fillRect(x + S + 2, y - 1, 2, 2);
        ctx.fillRect(x - S - 4, y - 1, 2, 2);
        ctx.fillRect(x - 1, y - S - 4, 2, 2);
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
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

    const hazardWarning = this.hazards.warningRemaining;
    if (hazardWarning > 0) {
      const warningLabels = {
        asteroids: '⚠ LLUVIA DE ASTEROIDES',
        magnetic: '⚠ CAMPO MAGNÉTICO',
      };
      const pulse = Math.floor(hazardWarning * 4) % 2 === 0;
      ctx.fillStyle = pulse ? '#ff4444' : '#ff9944';
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(
        `${warningLabels[this.hazards.pendingType] ?? '⚠ PELIGRO'} · EN ${Math.ceil(hazardWarning)}s`,
        this.width / 2,
        32,
      );
    } else if (this.hazards.active) {
      const labels = {
        asteroids: 'LLUVIA DE ASTEROIDES',
        magnetic: 'CAMPO MAGNÉTICO',
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

  #renderCountdown(ctx) {
    ctx.fillStyle = 'rgba(11, 14, 26, 0.55)';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.syncingClock) {
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText('Sincronizando…', this.width / 2, this.height / 2);
      return;
    }
    ctx.font = 'bold 96px system-ui, sans-serif';
    ctx.fillText(String(Math.ceil(this.countdown)), this.width / 2, this.height / 2 - 12);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = '#aeb8c9';
    ctx.fillText('¡Prepárate!', this.width / 2, this.height / 2 + 56);
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