export class CoopGateway {
  constructor({ roomRepository, code, uid, hostUid, onError = console.error }) {
    if (!roomRepository || typeof roomRepository.watchPlayers !== 'function') {
      throw new TypeError('A room repository is required for co-op synchronization.');
    }
    this.roomRepository = roomRepository;
    this.code = code;
    this.localUid = uid;
    this.hostUid = hostUid;
    this.onError = onError;
    this.handlers = null;
    this.pendingEvents = [];
    this.lastPublishAt = 0;
    this.currentPlayers = {};
    this.disposed = false;
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
    this.unsubscribePlayers();
    this.unsubscribeEvents();
    this.stopPresence().catch(this.onError);
  }

  #publish(event) {
    if (this.disposed) return;
    this.roomRepository.emitGameEvent(this.code, event).catch(this.onError);
  }
}
