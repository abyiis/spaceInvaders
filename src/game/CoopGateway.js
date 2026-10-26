import { createConnectionMonitor } from '../core/connectionMonitor.js';
import { createGameClock } from '../core/gameClock.js';
import { createInterpolationBuffer } from '../core/interpolationBuffer.js';
import { HOST_TAKEOVER_GRACE_MS, shouldTakeOverHost } from '../core/hostElection.js';
import { createPositionPublisher } from '../core/positionPublisher.js';

export class CoopGateway {
  /**
   * @param {{ roomRepository: object, code: string, uid: string, hostUid: string,
   *   seed?: number, startAt?: number, now?: () => number, onError?: (error: Error) => void,
   *   setTimeoutFn?: typeof setTimeout, clearTimeoutFn?: typeof clearTimeout,
   *   takeoverGraceMs?: number }} options
   *   `seed` es la semilla de la sala (de ella derivan todos los flujos de azar sincronizados).
   *   `startAt` es el instante cero de la partida (ms del servidor); `now` es el reloj local.
   */
  constructor({
    roomRepository,
    code,
    uid,
    hostUid,
    seed = null,
    startAt = null,
    now = Date.now,
    onError = console.error,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    takeoverGraceMs = HOST_TAKEOVER_GRACE_MS,
  }) {
    if (!roomRepository || typeof roomRepository.watchPlayers !== 'function') {
      throw new TypeError('A room repository is required for co-op synchronization.');
    }
    this.roomRepository = roomRepository;
    this.code = code;
    this.localUid = uid;
    this.hostUid = hostUid;
    this.seed = seed;
    this.onError = onError;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.takeoverGraceMs = takeoverGraceMs;
    this.takeoverTimer = null;
    this.roomStatus = null;
    this.clock = createGameClock({ now });
    this.monitor = createConnectionMonitor({ now });
    this.lastPeerTs = null;
    this.clock.setStartAt(startAt);
    this.handlers = null;
    this.pendingEvents = [];
    this.positionPublisher = createPositionPublisher({
      now,
      publish: (x) => {
        this.roomRepository.publishPlayerX(this.code, x).catch(this.onError);
      },
    });
    this.currentPlayers = {};
    this.remoteBuffer = createInterpolationBuffer();
    this.bufferedUid = null;
    this.disposed = false;
    this.unsubscribeOffset = roomRepository.watchServerOffset?.(
      (offset) => this.clock.setOffset(offset),
      onError,
    ) ?? (() => {});
    this.unsubscribePlayers = roomRepository.watchPlayers(
      code,
      (players) => {
        this.currentPlayers = players;
        this.#bufferRemotePosition();
        this.#trackPeerConnection();
        this.#evaluateTakeover();
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
    this.unsubscribeConnection = roomRepository.watchConnection?.(
      (online) => this.monitor.setLocalOnline(online),
      onError,
    ) ?? (() => {});
    this.unsubscribeMeta = roomRepository.watchRoomStatus?.(
      code,
      (meta) => this.#applyRoomMeta(meta),
      onError,
    ) ?? (() => {});
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

  /** Estado de la conexión (propia y del compañero) para avisar al jugador. */
  get connectionStatus() {
    return this.monitor.status();
  }

  get remoteUid() {
    return Object.keys(this.currentPlayers).find((playerUid) => playerUid !== this.localUid) ?? null;
  }

  /**
   * Posición del compañero: interpolada 100 ms atrás del reloj del servidor. Sin reloj o sin
   * marcas de tiempo (`ts`) cae a la última posición recibida.
   */
  get remoteX() {
    const serverNow = this.clock.serverNow();
    const interpolated = serverNow === null ? null : this.remoteBuffer.sample(serverNow);
    if (interpolated !== null) return interpolated;
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
    this.positionPublisher.update(x);
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

  emitState(t, score, lives, wave) {
    this.#publish({ type: 'state', t, score, lives, wave });
  }

  emitPhase({ kind, wave, t, score, lives, bossDefeated = false }) {
    this.#publish({
      type: 'phase',
      kind,
      wave,
      t,
      score,
      lives,
      ...(bossDefeated ? { bossDefeated: true } : {}),
    });
  }

  emitGameOver(t, score, wave, kills = {}) {
    this.#publish({ type: 'game-over', t, score, wave, kills });
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
    this.#cancelTakeover();
    this.unsubscribeConnection();
    this.unsubscribeMeta();
    this.unsubscribeOffset();
    this.unsubscribePlayers();
    this.unsubscribeEvents();
    this.stopPresence().catch(this.onError);
  }

  /** Alimenta el monitor con la presencia del compañero y con cada señal nueva suya. */
  #trackPeerConnection() {
    const peer = this.currentPlayers[this.remoteUid];
    this.monitor.setPeerConnected(peer?.connected);
    if (peer && peer.ts !== this.lastPeerTs) {
      this.lastPeerTs = peer.ts ?? null;
      this.monitor.notePeerSignal();
    }
  }

  /** Sigue `meta`: el host puede cambiar durante la partida (relevo) y la sala puede cerrarse. */
  #applyRoomMeta(meta) {
    if (this.disposed || !meta) return;
    this.roomStatus = typeof meta.status === 'string' ? meta.status : this.roomStatus;
    if (typeof meta.hostUid === 'string' && meta.hostUid !== this.hostUid) {
      this.hostUid = meta.hostUid;
      this.handlers?.onHostChange?.(meta.hostUid);
    }
    this.#evaluateTakeover();
  }

  /** Si el host se cae y me toca, lo releva tras un margen para ignorar cortes breves. */
  #evaluateTakeover() {
    if (this.disposed) return;
    const should = shouldTakeOverHost({
      players: this.currentPlayers,
      hostUid: this.hostUid,
      myUid: this.localUid,
      status: this.roomStatus,
    });
    if (!should) {
      this.#cancelTakeover();
      return;
    }
    if (this.takeoverTimer !== null) return;
    const previousHostUid = this.hostUid;
    this.takeoverTimer = this.setTimeoutFn(() => {
      this.takeoverTimer = null;
      if (this.disposed || this.hostUid !== previousHostUid) return;
      this.roomRepository.claimHost?.(this.code, previousHostUid)
        .then((claimed) => {
          if (!claimed || this.disposed || this.hostUid === this.localUid) return;
          this.hostUid = this.localUid;
          this.handlers?.onHostChange?.(this.localUid);
        })
        .catch(this.onError);
    }, this.takeoverGraceMs);
  }

  #cancelTakeover() {
    if (this.takeoverTimer === null) return;
    this.clearTimeoutFn(this.takeoverTimer);
    this.takeoverTimer = null;
  }

  #bufferRemotePosition() {
    const uid = this.remoteUid;
    if (uid !== this.bufferedUid) {
      this.remoteBuffer.clear();
      this.bufferedUid = uid;
    }
    const remote = this.currentPlayers[uid];
    if (remote) this.remoteBuffer.push(remote.ts, remote.x);
  }

  #publish(event) {
    if (this.disposed) return;
    this.roomRepository.emitGameEvent(this.code, event).catch(this.onError);
  }
}
