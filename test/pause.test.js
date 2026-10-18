import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/Game.js';
import { attachLifecycle } from '../src/lifecycle.js';

const constantRandom = () => 0.5;
const newGame = (opts = {}) => new Game({ random: constantRandom, ...opts });

/** Documento falso: un EventTarget con `visibilityState` editable. */
function fakeDocument() {
  const doc = new EventTarget();
  doc.visibilityState = 'visible';
  doc.setVisibility = (state) => {
    doc.visibilityState = state;
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  return doc;
}

/** Plugin `App` falso que guarda el listener y cuenta las bajas. */
function fakeApp() {
  const app = {
    listener: null,
    removed: 0,
    async addListener(event, listener) {
      assert.equal(event, 'appStateChange');
      app.listener = listener;
      return { remove: async () => { app.removed += 1; } };
    },
  };
  return app;
}

/** Contexto 2D falso que registra los textos dibujados. */
function fakeCtx() {
  const texts = [];
  return new Proxy(
    { texts },
    {
      get(target, prop) {
        if (prop === 'texts') return target.texts;
        if (prop === 'fillText') return (text) => target.texts.push(text);
        return () => {};
      },
      set: () => true,
    },
  );
}

test('pause congela la simulación y resume la reanuda', () => {
  const g = newGame();
  g.update(0.1);
  const elapsed = g.elapsed;
  const enemyX = g.formation.enemies[0].x;
  const bullets = g.bullets.length;

  g.pause();
  assert.equal(g.paused, true);
  for (let i = 0; i < 120; i++) g.update(1 / 60);

  assert.equal(g.elapsed, elapsed);
  assert.equal(g.formation.enemies[0].x, enemyX);
  assert.equal(g.bullets.length, bullets);

  g.resume();
  assert.equal(g.paused, false);
  g.update(0.1);
  assert.ok(g.elapsed > elapsed);
});

test('la pausa congela también la invulnerabilidad', () => {
  const g = newGame();
  g.player.invulnerable = 1;

  g.pause();
  g.update(5);

  assert.equal(g.player.invulnerable, 1);
});

test('pause es idempotente', () => {
  const g = newGame();
  g.pause();
  g.pause();
  assert.equal(g.paused, true);
  g.resume();
  assert.equal(g.paused, false);
});

test('no se puede pausar después del Game Over', () => {
  const g = newGame();
  g.isGameOver = true;
  g.pause();
  assert.equal(g.paused, false);
});

test('no se pausa en coop: el reloj depende del servidor', () => {
  const sync = {
    isCoop: true,
    publishPlayerX() {},
    emitShot() {},
    emitKill() {},
    emitHit() {},
    dispose() {},
  };
  const g = newGame({ sync });
  g.pause();
  assert.equal(g.paused, false);
});

test('startNewGame quita la pausa', () => {
  const g = newGame();
  g.pause();
  g.startNewGame();
  assert.equal(g.paused, false);
});

test('render en pausa muestra el aviso y en juego normal no', () => {
  const g = newGame();
  const running = fakeCtx();
  g.render(running);
  assert.ok(!running.texts.includes('PAUSA'));

  g.pause();
  const paused = fakeCtx();
  g.render(paused);
  assert.ok(paused.texts.includes('PAUSA'));
  assert.ok(paused.texts.includes('Toca para continuar'));
});

test('lifecycle: visibilitychange a hidden pausa y volver a visible no reanuda', () => {
  const g = newGame();
  const doc = fakeDocument();
  attachLifecycle(g, { doc });

  doc.setVisibility('hidden');
  assert.equal(g.paused, true);

  doc.setVisibility('visible');
  assert.equal(g.paused, true, 'reanudar es manual');
});

test('lifecycle: appStateChange inactivo pausa y activo no reanuda', () => {
  const g = newGame();
  const app = fakeApp();
  attachLifecycle(g, { doc: fakeDocument(), app });

  return Promise.resolve().then(() => {
    app.listener({ isActive: false });
    assert.equal(g.paused, true);

    app.listener({ isActive: true });
    assert.equal(g.paused, true, 'reanudar es manual');
  });
});

test('lifecycle: la función devuelta quita los listeners', async () => {
  const g = newGame();
  const doc = fakeDocument();
  const app = fakeApp();
  const detach = attachLifecycle(g, { doc, app });

  detach();
  await Promise.resolve();
  await Promise.resolve();

  doc.setVisibility('hidden');
  assert.equal(g.paused, false);
  assert.equal(app.removed, 1);
});

test('lifecycle: si el plugin App falla, la pausa por visibilidad sigue funcionando', async () => {
  const g = newGame();
  const doc = fakeDocument();
  const app = { addListener: () => Promise.reject(new Error('plugin no disponible')) };

  const detach = attachLifecycle(g, { doc, app });
  await Promise.resolve();
  await Promise.resolve();

  doc.setVisibility('hidden');
  assert.equal(g.paused, true);
  assert.doesNotThrow(detach);
});

test('lifecycle: funciona sin plugin App', () => {
  const g = newGame();
  const doc = fakeDocument();
  attachLifecycle(g, { doc });
  doc.setVisibility('hidden');
  assert.equal(g.paused, true);
});