import { Game } from '../../src/game/Game.js';
import { CoopGateway } from '../../src/game/CoopGateway.js';
import { mulberry32 } from '../../src/core/prng.js';

/**
 * Sala de RTDB en memoria para pruebas de integración: entrega eventos y posiciones a todos los
 * suscriptores, en orden, con una latencia fija sobre un reloj virtual compartido.
 *
 * @param {{ clock: { now: number }, latencyMs?: number }} options
 */
export function createFakeRoom({ clock, latencyMs = 60 }) {
  const players = {};
  const presence = new Set();
  const playerListeners = new Set();
  const eventListeners = new Set();
  const meta = { hostUid: null, status: 'playing' };
  const metaListeners = new Set();
  const queue = [];
  let sequence = 0;

  const schedule = (action) => {
    sequence += 1;
    queue.push({ due: clock.now + latencyMs, sequence, action });
  };

  const snapshot = () => JSON.parse(JSON.stringify(players));

  return {
    meta,
    players,
    sentEvents: [],

    /** Entrega lo que ya venció, en orden de envío. */
    deliver() {
      queue.sort((a, b) => a.due - b.due || a.sequence - b.sequence);
      while (queue.length > 0 && queue[0].due <= clock.now) queue.shift().action();
    },

    setConnected(uid, connected) {
      players[uid] = { ...players[uid], connected };
      schedule(() => playerListeners.forEach((listener) => listener(snapshot())));
    },

    setHost(uid) {
      meta.hostUid = uid;
      schedule(() => metaListeners.forEach((listener) => listener({ ...meta })));
    },

    repositoryFor(uid) {
      return {
        watchServerOffset: (onOffset) => {
          onOffset(0);
          return () => {};
        },
        watchPlayers: (_code, listener) => {
          playerListeners.add(listener);
          return () => playerListeners.delete(listener);
        },
        watchGameEvents: (_code, listener) => {
          eventListeners.add(listener);
          return () => eventListeners.delete(listener);
        },
        watchRoomStatus: (_code, listener) => {
          metaListeners.add(listener);
          listener({ ...meta });
          return () => metaListeners.delete(listener);
        },
        watchPresence: () => {
          presence.add(uid);
          players[uid] = { ...players[uid], connected: true };
          return async () => {
            presence.delete(uid);
            players[uid] = { ...players[uid], connected: false };
          };
        },
        publishPlayerX: async (_code, x) => {
          const ts = clock.now;
          schedule(() => {
            players[uid] = { ...players[uid], x, ts };
            playerListeners.forEach((listener) => listener(snapshot()));
          });
        },
        emitGameEvent: async (_code, event) => {
          const stored = { ...event, uid, t: Number.isFinite(event.t) ? event.t : 0 };
          const key = `event-${String(sequence + 1).padStart(8, '0')}`;
          this.sentEvents.push(stored);
          schedule(() => eventListeners.forEach((listener) => listener(key, stored)));
        },
        claimHost: async () => {
          meta.hostUid = uid;
          schedule(() => metaListeners.forEach((listener) => listener({ ...meta })));
          return true;
        },
      };
    },
  };
}

/** Temporizadores sobre el reloj virtual de la prueba. */
export function createVirtualTimers(clock) {
  const pending = new Map();
  let nextId = 1;
  return {
    setTimeout: (callback, delay) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, { due: clock.now + delay, callback });
      return id;
    },
    clearTimeout: (id) => { pending.delete(id); },
    /** Ejecuta los temporizadores vencidos. */
    tick() {
      for (const [id, timer] of [...pending]) {
        if (timer.due <= clock.now) {
          pending.delete(id);
          timer.callback();
        }
      }
    },
    get size() {
      return pending.size;
    },
  };
}

/** Crea un cliente coop completo (juego + pasarela) conectado a la sala falsa. */
export function createClient({ room, clock, uid, hostUid, seed, startAt, randomSeed, onGameOver, timers }) {
  const gateway = new CoopGateway({
    roomRepository: room.repositoryFor(uid),
    code: 'ABCDE',
    uid,
    hostUid,
    seed,
    startAt,
    now: () => clock.now,
    setTimeoutFn: timers?.setTimeout,
    clearTimeoutFn: timers?.clearTimeout,
    onError: (error) => { throw error; },
  });
  const game = new Game({
    sync: gateway,
    random: mulberry32(randomSeed),
    onGameOver,
  });
  game.player.invulnerable = 1e9;
  return { uid, gateway, game };
}

/** Piloto automático: se coloca bajo el objetivo más cercano. */
export function autopilot({ game, uid }) {
  const { player } = game;
  let targetX = player.x;
  if (game.boss) targetX = game.boss.x;
  else if (game.bonusStage?.ships.length) {
    const ship = game.bonusStage.ships.reduce((a, b) => (Math.abs(a.x - player.x) < Math.abs(b.x - player.x) ? a : b));
    targetX = ship.x;
  } else {
    const alive = game.formation.alive.filter((enemy) => !enemy.diving);
    if (alive.length > 0) {
      targetX = alive.reduce((a, b) => (Math.abs(a.x - player.x) < Math.abs(b.x - player.x) ? a : b)).x;
    }
  }
  // Cada piloto apunta algo a un lado para que sus disparos no se anulen entre sí (sinergia).
  const aim = targetX + (uid === 'host' ? -16 : 16);
  player.moveBy(Math.max(-6, Math.min(6, aim - player.x)));
}
