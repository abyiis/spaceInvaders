import { createGameClock } from '../core/gameClock.js';

export class CoopGateway {
  /**
   * @param {{ roomRepository: object, code: string, uid: string, hostUid: string,
   *   startAt?: number, now?: () => number, onError?: (error: Error) => void }} options
   *   `startAt` es el instante cero de la partida (ms del servidor); `now` es el reloj local.
   */
  constructor({ roomRepository, code, uid, hostUid, startAt = null, now = Date.now, onError = console.error }) {
    if (!roomRepository || typeof roomRepository.watchPlayers !== 'function') {
      throw new TypeError('A room repository is required for co-op synchronization.');
    }
    this.roomRepository = roomRepository;
    this.code = code;
    this.localUid = uid;
    this.hostUid = hostUid;
    this.onError = onError;
    this.clock = createGameClock({ now });
    this.clock.setStartAt(startAt);
    this.handlers = null;
    this.pendingEvents = [];
    this.lastPublishAt = 0;
    this.currentPlayers = {};
    this.disposed = false;
    this.unsubscribeOffset = roomRepository.watchServerOffset?.(
      (offset) => this.clock.setOffset(offset),
      onError,
    ) ?? (() => {});
    this.unsubscribePlayers = roomRepository.watchPlayers(
      code,
      (players) => {
        this.currentPlayers = players;
      },
      onError,
    );
    this.unsubscribeEvents = roomRepository.watchGameEvents(
      code,
      (eventId, event) => {
        if (!event || event.uid === this.localUid || this.disposed) return;
        if (this.handlers) this.handlers.onEvent?.(eventId, event);
        else this.pendingEvents.push([eventId, event]);
      },
      onError,
    );
    this.stopPresence = roomRepository.watchPresence(code, uid, onError);
  }

  get isCoop() {
    return true;
  }

  get uid() {
    return this.localUid;
  }

  get isHost() {
    return this.localUid === this.hostUid;
  }

  /** Segundos de juego según el reloj del servidor; `null` mientras no se conoce el desfase. */
  gameTime() {
    return this.clock.gameTime();
  }

  get remoteUid() {
    return Object.keys(this.currentPlayers).find((playerUid) => playerUid !== this.localUid) ?? null;
  }

  get remoteX() {
    const x = this.currentPlayers[this.remoteUid]?.x;
    return Number.isFinite(x) ? x : null;
  }

  setHandlers(handlers) {
    this.handlers = handlers;
    for (const [eventId, event] of this.pendingEvents) {
      handlers.onEvent?.(eventId, event);
    }
    this.pendingEvents.length = 0;
  }

  publishPlayerX(x) {
    if (this.disposed) return;
    const now = Date.now();
    if (now - this.lastPublishAt < 100) return;
    this.lastPublishAt = now;
    this.roomRepository.publishPlayerX(this.code, x).catch(this.onError);
  }

  emitShot(t, x, damage = 1, vx = 0) {
    this.#publish({ type: 'shot', t, x, damage, vx });
  }

  emitEnemyShot(t, x, y, vx, vy, color = null) {
    this.#publish({
      type: 'enemy-shot',
      t,
      x,
      y,
      vx,
      vy,
      ...(color ? { color } : {}),
    });
  }

  emitKill(wave, enemyId, t, powerUpType = null) {
    this.#publish({
      type: 'kill',
      wave,
      enemyId,
      t,
      ...(powerUpType ? { powerUpType } : {}),
    });
  }

  emitHit(t) {
    this.#publish({ type: 'hit', t });
  }

  emitRevive(targetUid, t) {
    this.#publish({ type: 'revive', targetUid, t });
  }

  emitLifeLoss(t, consumedLife) {
    this.#publish({ type: 'life-loss', t, consumedLife });
  }

  emitBonusKill(wave, shipId, multiplier, t, powerUpType = null) {
    this.#publish({
      type: 'bonus-kill',
      wave,
      shipId,
      multiplier,
      t,
      ...(powerUpType ? { powerUpType } : {}),
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeOffset();
    this.unsubscribePlayers();
    this.unsubscribeEvents();
    this.stopPresence().catch(this.onError);
  }

  #publish(event) {
    if (this.disposed) return;
    this.roomRepository.emitGameEvent(this.code, event).catch(this.onError);
  }
}
