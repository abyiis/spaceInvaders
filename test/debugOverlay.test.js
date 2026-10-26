import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEBUG_STORAGE_KEY,
  describeStats,
  formatRate,
  isDebugRequested,
  mountDebugOverlay,
} from '../src/debug/debugOverlay.js';

test('se pide el panel con ?debug=1 o con la marca guardada', () => {
  assert.equal(isDebugRequested({ search: '?debug=1' }), true);
  assert.equal(isDebugRequested({ search: '?debug=0' }), false);
  assert.equal(isDebugRequested({ search: '' }), false);
  assert.equal(isDebugRequested({ storage: { getItem: (key) => (key === DEBUG_STORAGE_KEY ? '1' : null) } }), true);
  assert.equal(isDebugRequested({ storage: { getItem: () => null } }), false);
  assert.equal(isDebugRequested({ storage: { getItem: () => { throw new Error('bloqueado'); } } }), false);
});

test('describe los FPS y, si hay red, el tráfico', () => {
  const frames = { fps: 59.6, averageMs: 16.8, worstMs: 41.2, slowPercent: 1.234 };
  assert.deepEqual(describeStats({ frames }), ['60 FPS · 16.8 ms', 'peor 41 ms · lentos 1.2 %']);
  const lines = describeStats({
    frames,
    traffic: { sentPerSecond: 1536, receivedPerSecond: 512, totalSent: 3072, totalReceived: 1024 },
  });
  assert.equal(lines[2], '↑ 1.50 KB/s · ↓ 0.50 KB/s');
  assert.equal(lines[3], 'total ↑ 3.0 KB · ↓ 1.0 KB');
  assert.equal(formatRate(2048), '2.00 KB/s');
});

test('el panel se actualiza con un temporizador y se retira al desmontar', () => {
  const previousDocument = globalThis.document;
  const parent = { children: [], append(element) { this.children.push(element); } };
  const panel = {
    textContent: '',
    className: '',
    setAttribute() {},
    remove() { parent.children = parent.children.filter((child) => child !== panel); },
  };
  globalThis.document = { createElement: () => panel };
  try {
    let fps = 30;
    let tick;
    let cleared = false;
    const unmount = mountDebugOverlay(parent, {
      getStats: () => ({ frames: { fps, averageMs: 1, worstMs: 2, slowPercent: 0 } }),
      setIntervalFn: (callback) => { tick = callback; return 7; },
      clearIntervalFn: (id) => { cleared = id === 7; },
    });
    assert.equal(parent.children.length, 1);
    assert.match(panel.textContent, /^30 FPS/);
    fps = 60;
    tick();
    assert.match(panel.textContent, /^60 FPS/);
    unmount();
    assert.equal(cleared, true);
    assert.equal(parent.children.length, 0);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('cinco toques seguidos sobre el elemento activan el panel y el contador se reinicia', async () => {
  const { attachDebugTapGesture } = await import('../src/debug/debugOverlay.js');
  let time = 0;
  let toggles = 0;
  let listener = null;
  const element = {
    addEventListener: (type, callback) => { assert.equal(type, 'click'); listener = callback; },
    removeEventListener: (type, callback) => { assert.equal(callback, listener); listener = null; },
  };
  const detach = attachDebugTapGesture(element, { now: () => time, onToggle: () => { toggles += 1; } });

  for (let tap = 0; tap < 4; tap += 1) { time += 200; listener(); }
  assert.equal(toggles, 0);
  time += 200; listener();
  assert.equal(toggles, 1);

  for (let tap = 0; tap < 5; tap += 1) { time += 200; listener(); }
  assert.equal(toggles, 2);
  detach();
  assert.equal(listener, null);
});

test('toques espaciados más de 3 s no activan el panel', async () => {
  const { attachDebugTapGesture } = await import('../src/debug/debugOverlay.js');
  let time = 0;
  let toggles = 0;
  let listener = null;
  attachDebugTapGesture(
    { addEventListener: (_type, callback) => { listener = callback; }, removeEventListener() {} },
    { now: () => time, onToggle: () => { toggles += 1; } },
  );
  for (let tap = 0; tap < 20; tap += 1) { time += 1000; listener(); }
  assert.equal(toggles, 0);
});
