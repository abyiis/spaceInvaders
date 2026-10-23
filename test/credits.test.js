import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountCredits } from '../src/ui/screens/credits.js';

class FakeElement {
  constructor() {
    this.children = new Map();
    this.listeners = new Map();
  }

  setAttribute() {}

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  querySelector(selector) {
    if (!this.children.has(selector)) this.children.set(selector, new FakeElement());
    return this.children.get(selector);
  }

  append(child) {
    this.child = child;
  }

  focus() {}

  remove() {}
}

function withFakeDocument(run) {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => new FakeElement() };
  try {
    run();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

test('los créditos del easter egg continúan a resultados en lugar del menú', () => {
  withFakeDocument(() => {
    const container = new FakeElement();
    const calls = [];
    const result = { mode: 'solo', score: 100, wave: 1, durationSeconds: 12 };

    mountCredits(container, { result }, {
      show: (...args) => calls.push(args),
    });

    const screen = container.child;
    screen.children.get('[data-action="back"]').listeners.get('click')();

    assert.deepEqual(calls, [['results', { result }]]);
  });
});

test('los créditos sin resultado regresan al menú', () => {
  withFakeDocument(() => {
    const container = new FakeElement();
    const calls = [];

    mountCredits(container, {}, {
      show: (...args) => calls.push(args),
    });

    container.child.children.get('[data-action="back"]').listeners.get('click')();

    assert.deepEqual(calls, [['home']]);
  });
});
