import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C } from '../src/core/constants.js';
import { Game } from '../src/game/Game.js';
import { Bullet } from '../src/game/Bullet.js';
import { NoopEffects } from '../src/game/Effects.js';
import { createEffects } from '../src/effects.js';

const constantRandom = () => 0.5;

/** Efectos falsos que cuentan cada evento. */
function recordingEffects() {
  const counts = { shot: 0, kill: 0, hit: 0, gameOver: 0, unlock: 0 };
  const fx = {
    counts,
    shot: () => counts.shot++,
    kill: () => counts.kill++,
    hit: () => counts.hit++,
    gameOver: () => counts.gameOver++,
    unlock: () => counts.unlock++,
  };
  return fx;
}

/** AudioContext falso: nace suspendido y registra los osciladores creados. */
function fakeAudioContextClass() {
  const created = { contexts: [], oscillators: [] };

  class FakeAudioContext {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 0;
      this.destination = {};
      this.resumeCalls = 0;
      created.contexts.push(this);
    }

    resume() {
      this.resumeCalls += 1;
      this.state = 'running';
      return Promise.resolve();
    }

    createGain() {
      return {
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
      };
    }

    createOscillator() {
      const osc = {
        type: null,
        starts: [],
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        start(t) {
          osc.starts.push(t);
        },
        stop() {},
      };
      created.oscillators.push(osc);
      return osc;
    }
  }

  return { FakeAudioContext, created };
}

test('Game usa NoopEffects por defecto y funciona sin sonido', () => {
  const g = new Game({ random: constantRandom });
  assert.ok(g.effects instanceof NoopEffects);
  assert.doesNotThrow(() => {
    for (let i = 0; i < 120; i++) g.update(1 / 60);
  });
});

test('el disparo del jugador activa shot', () => {
  const effects = recordingEffects();
  const g = new Game({ random: constantRandom, effects });

  g.update(0.1);

  assert.equal(effects.counts.shot, 1);
});

test('destruir un enemigo activa kill; un impacto que no destruye no', () => {
  const effects = recordingEffects();
  const g = new Game({ random: constantRandom, effects });
  g.player.fireCooldown = 1e9;
  const enemy = g.formation.enemies[0];
  enemy.hp = 2;
  const fire = () =>
    g.bullets.push(new Bullet({ x: enemy.x, y: enemy.y, fromPlayer: true, vy: -C.PLAYER_BULLET_SPEED }));

  fire();
  g.update(0.001);
  assert.equal(effects.counts.kill, 0);

  fire();
  g.update(0.001);
  assert.equal(effects.counts.kill, 1);
});

test('perder una vida activa hit; el golpe durante la invulnerabilidad no', () => {
  const effects = recordingEffects();
  const g = new Game({ random: constantRandom, effects });
  g.player.fireCooldown = 1e9;
  const shoot = () =>
    g.bullets.push(new Bullet({ x: g.player.x, y: g.player.y, fromPlayer: false, vy: C.ENEMY_BULLET_SPEED }));

  shoot();
  g.update(0.001);
  shoot();
  g.update(0.001);

  assert.equal(effects.counts.hit, 1);
  assert.equal(effects.counts.gameOver, 0);
});

test('gameOver suena una sola vez aunque se dispare varias veces', () => {
  const effects = recordingEffects();
  const g = new Game({ random: constantRandom, effects });
  g.lives = 1;
  g.player.fireCooldown = 1e9;
  g.bullets.push(new Bullet({ x: g.player.x, y: g.player.y, fromPlayer: false, vy: C.ENEMY_BULLET_SPEED }));

  g.update(0.001);
  g.triggerGameOver();
  g.update(0.5);

  assert.equal(g.isGameOver, true);
  assert.equal(effects.counts.hit, 1);
  assert.equal(effects.counts.gameOver, 1);
});

test('en pausa no suena nada', () => {
  const effects = recordingEffects();
  const g = new Game({ random: constantRandom, effects });
  g.pause();

  for (let i = 0; i < 120; i++) g.update(1 / 60);

  assert.deepEqual(effects.counts, { shot: 0, kill: 0, hit: 0, gameOver: 0, unlock: 0 });
});

test('createEffects: sin Web Audio ni plugin ningún método lanza', () => {
  const fx = createEffects({ AudioContextClass: undefined });
  assert.doesNotThrow(() => {
    fx.unlock();
    fx.shot();
    fx.kill();
    fx.hit();
    fx.gameOver();
  });
});

test('createEffects: antes del primer gesto no suena nada', () => {
  const { FakeAudioContext, created } = fakeAudioContextClass();
  const fx = createEffects({ AudioContextClass: FakeAudioContext });

  fx.shot();
  fx.kill();
  fx.hit();
  fx.gameOver();

  assert.equal(created.contexts.length, 0);
  assert.equal(created.oscillators.length, 0);
});

test('createEffects: unlock crea y reanuda el contexto una sola vez', () => {
  const { FakeAudioContext, created } = fakeAudioContextClass();
  const fx = createEffects({ AudioContextClass: FakeAudioContext });

  fx.unlock();
  fx.unlock();
  fx.unlock();

  assert.equal(created.contexts.length, 1);
  assert.equal(created.contexts[0].state, 'running');
  assert.equal(created.contexts[0].resumeCalls, 1);
});

test('createEffects: unlock reanuda un contexto que se volvió a suspender', () => {
  const { FakeAudioContext, created } = fakeAudioContextClass();
  const fx = createEffects({ AudioContextClass: FakeAudioContext });
  fx.unlock();

  created.contexts[0].state = 'interrupted';
  fx.unlock();

  assert.equal(created.contexts[0].state, 'running');
  assert.equal(created.contexts[0].resumeCalls, 2);
});

test('createEffects: cada evento crea los osciladores esperados tras desbloquear', () => {
  const { FakeAudioContext, created } = fakeAudioContextClass();
  const fx = createEffects({ AudioContextClass: FakeAudioContext });
  fx.unlock();

  fx.shot();
  assert.equal(created.oscillators.length, 1);
  assert.equal(created.oscillators[0].type, 'square');

  fx.kill();
  assert.equal(created.oscillators.length, 2);
  assert.equal(created.oscillators[1].type, 'triangle');

  fx.hit();
  assert.equal(created.oscillators.length, 3);
  assert.equal(created.oscillators[2].type, 'sawtooth');

  fx.gameOver();
  assert.equal(created.oscillators.length, 6, 'tres notas');
  const starts = created.oscillators.slice(3).map((o) => o.starts[0]);
  assert.ok(starts[0] < starts[1] && starts[1] < starts[2], 'las notas van en secuencia');
});

test('createEffects: hit vibra 150 ms y solo hit vibra', () => {
  const calls = [];
  const haptics = { vibrate: async (options) => calls.push(options) };
  const fx = createEffects({ AudioContextClass: undefined, haptics });

  fx.shot();
  fx.kill();
  fx.gameOver();
  assert.equal(calls.length, 0);

  fx.hit();
  assert.deepEqual(calls, [{ duration: 150 }]);
});

test('createEffects: si la vibración falla (lanza o rechaza) el juego sigue', async () => {
  const throwing = createEffects({
    AudioContextClass: undefined,
    haptics: {
      vibrate() {
        throw new Error('sin vibración');
      },
    },
  });
  const rejecting = createEffects({
    AudioContextClass: undefined,
    haptics: { vibrate: () => Promise.reject(new Error('no disponible')) },
  });

  assert.doesNotThrow(() => throwing.hit());
  assert.doesNotThrow(() => rejecting.hit());
  // Deja correr la promesa rechazada: si no estuviera capturada, Node abortaría la prueba.
  await new Promise((resolve) => setTimeout(resolve, 10));
});

test('createEffects: un AudioContext que falla al crearse no rompe unlock', () => {
  class BrokenAudioContext {
    constructor() {
      throw new Error('audio no disponible');
    }
  }
  const fx = createEffects({ AudioContextClass: BrokenAudioContext });

  assert.doesNotThrow(() => {
    fx.unlock();
    fx.shot();
    fx.hit();
  });
});
