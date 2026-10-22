import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createScoreSaveController,
  formatDuration,
  formatScore,
  mountResults,
  scheduleResultsNavigation,
} from '../src/ui/screens/results.js';

class FakeElement {
  constructor(document) {
    this.document = document;
    this.children = new Map();
    this.listeners = new Map();
    this.textContent = '';
    this.hidden = true;
    this.disabled = false;
  }

  setAttribute() {}

  removeAttribute() {}

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  querySelector(selector) {
    if (!this.children.has(selector)) {
      this.children.set(selector, new FakeElement(this.document));
    }
    return this.children.get(selector);
  }

  append(element) {
    this.child = element;
  }

  focus() {
    this.document.activeElement = this;
  }

  remove() {
    this.removed = true;
  }
}

async function withFakeDocument(run) {
  const previousDocument = globalThis.document;
  const document = {
    activeElement: null,
    createElement: () => new FakeElement(document),
  };
  globalThis.document = document;
  try {
    await run(document);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

test('formatScore separa miles con punto', () => {
  assert.equal(formatScore(0), '0');
  assert.equal(formatScore(999), '999');
  assert.equal(formatScore(1000), '1.000');
  assert.equal(formatScore(1250), '1.250');
  assert.equal(formatScore(1234567), '1.234.567');
});

test('formatDuration muestra mm:ss y no limita los minutos', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(59.9), '00:59');
  assert.equal(formatDuration(60), '01:00');
  assert.equal(formatDuration(205.4), '03:25');
  assert.equal(formatDuration(4510), '75:10');
});

function fakeTimer() {
  let callback;
  let cleared = false;
  return {
    setTimeoutFn(fn, delay) {
      assert.equal(delay, 1200);
      callback = fn;
      return 1;
    },
    clearTimeoutFn(id) {
      assert.equal(id, 1);
      cleared = true;
    },
    fire() {
      callback();
    },
    get cleared() {
      return cleared;
    },
  };
}

test('muestra resultados tras 1,2 segundos solo si aún se está jugando', () => {
  const timer = fakeTimer();
  const calls = [];
  const router = {
    current: 'playing',
    show: (...args) => calls.push(args),
  };
  const result = { mode: 'solo', score: 250, wave: 2, durationSeconds: 42 };

  scheduleResultsNavigation(router, result, timer);
  assert.deepEqual(calls, []);
  timer.fire();
  assert.deepEqual(calls, [['results', { result }]]);

  const staleTimer = fakeTimer();
  router.current = 'home';
  scheduleResultsNavigation(router, result, staleTimer);
  staleTimer.fire();
  assert.equal(calls.length, 1);
});

test('cancelar impide la navegación y limpia el temporizador', () => {
  const timer = fakeTimer();
  const calls = [];
  const router = { current: 'playing', show: (...args) => calls.push(args) };
  const cancel = scheduleResultsNavigation(router, {}, timer);
  cancel();
  timer.fire();

  assert.equal(timer.cleared, true);
  assert.deepEqual(calls, []);
});

test('controla estados al guardar y permite un nuevo intento tras un error', async () => {
  const states = [];
  const result = { score: 300 };
  let attempts = 0;
  const controller = createScoreSaveController({
    result,
    saveScore: async (received) => {
      assert.equal(received, result);
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
    },
    onState: (state) => states.push(state.status),
  });

  await controller.save();
  await controller.save();

  assert.deepEqual(states, ['saving', 'error', 'saving', 'saved']);
  assert.equal(attempts, 2);
});

test('no duplica guardados simultáneos y descarta estados después de dispose', async () => {
  const states = [];
  let finishSave;
  let attempts = 0;
  const controller = createScoreSaveController({
    result: {},
    saveScore: () => {
      attempts += 1;
      return new Promise((resolve) => { finishSave = resolve; });
    },
    onState: (state) => states.push(state.status),
  });

  const first = controller.save();
  const duplicate = controller.save();
  controller.dispose();
  finishSave();
  await Promise.all([first, duplicate]);

  assert.equal(attempts, 1);
  assert.deepEqual(states, ['saving']);
});

test('mountResults presenta el resultado y enfoca Jugar de nuevo sin Firebase', async () => {
  await withFakeDocument((document) => {
    const container = new FakeElement(document);
    const navCalls = [];
    const unmount = mountResults(container, {
      result: { mode: 'solo', score: 1250, wave: 3, durationSeconds: 205.4 },
    }, { show: (...args) => navCalls.push(args) });
    const screen = container.child;

    assert.equal(screen.querySelector('[data-result-score]').textContent, '1.250');
    assert.equal(screen.querySelector('[data-result-wave]').textContent, '3');
    assert.equal(screen.querySelector('[data-result-duration]').textContent, '03:25');
    assert.equal(screen.querySelector('[data-save-area]').hidden, true);
    assert.equal(document.activeElement, screen.querySelector('[data-action="replay"]'));

    screen.querySelector('[data-action="replay"]').listeners.get('click')();
    screen.querySelector('[data-action="home"]').listeners.get('click')();
    assert.deepEqual(navCalls, [['playing'], ['home']]);
    unmount();
    assert.equal(screen.removed, true);
  });
});

test('mountResults muestra el nuevo récord y los estados/reintento de guardado', async () => {
  await withFakeDocument(async (document) => {
    const container = new FakeElement(document);
    let attempts = 0;
    const unmount = mountResults(container, {
      result: { mode: 'solo', score: 1300, wave: 4, durationSeconds: 300 },
      bestScoreStore: { submit: () => ({ best: 1300, isNewBest: true }) },
      saveScore: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('offline');
      },
    }, { show() {} });
    const screen = container.child;
    const status = screen.querySelector('[data-save-status]');
    const retry = screen.querySelector('[data-action="retry"]');
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(screen.querySelector('[data-new-best]').hidden, false);
    assert.equal(status.textContent, 'No se pudo guardar el puntaje');
    assert.equal(status.title, 'offline');
    assert.equal(retry.hidden, false);

    retry.listeners.get('click')();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(status.textContent, 'Puntaje guardado en el ranking');
    assert.equal(attempts, 2);
    unmount();
  });
});
