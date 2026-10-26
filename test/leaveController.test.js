import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLeaveController } from '../src/ui/leaveController.js';
import { CoopGateway } from '../src/game/CoopGateway.js';

function setup({ coop = true, onLeave } = {}) {
  const calls = [];
  const target = new EventTarget();
  const game = { isGameOver: false, sync: { isCoop: coop } };
  const errors = [];
  const controller = createLeaveController({
    game,
    onOpen: () => calls.push('open'),
    onClose: () => calls.push('close'),
    onLeave: onLeave ?? (async () => { calls.push('leave'); }),
    onError: (error) => errors.push(error.message),
    eventTarget: target,
  });
  return { calls, controller, errors, game, target };
}

const press = (target, code) => {
  const event = new Event('keydown');
  event.code = code;
  target.dispatchEvent(event);
};

test('open muestra la confirmación solo en coop y mientras la partida sigue', () => {
  const coop = setup();
  assert.equal(coop.controller.open(), true);
  assert.equal(coop.controller.open(), false);
  assert.deepEqual(coop.calls, ['open']);

  const solo = setup({ coop: false });
  assert.equal(solo.controller.open(), false);
  assert.deepEqual(solo.calls, []);

  const finished = setup();
  finished.game.isGameOver = true;
  assert.equal(finished.controller.open(), false);
});

test('«Seguir jugando» cierra la confirmación sin salir', () => {
  const { calls, controller } = setup();
  controller.open();
  assert.equal(controller.stay(), true);
  assert.equal(controller.isOpen, false);
  assert.equal(controller.stay(), false);
  assert.deepEqual(calls, ['open', 'close']);
});

test('«Salir» ejecuta la salida una sola vez', async () => {
  const { calls, controller } = setup();
  controller.open();
  const [first, second] = await Promise.all([controller.leave(), controller.leave()]);
  assert.equal(first, true);
  assert.equal(second, false);
  assert.deepEqual(calls, ['open', 'leave']);
  assert.equal(await controller.leave(), false);
});

test('salir sin abrir la confirmación no hace nada', async () => {
  const { calls, controller } = setup();
  assert.equal(await controller.leave(), false);
  assert.deepEqual(calls, []);
});

test('si la salida falla se informa, la confirmación sigue abierta y se puede reintentar', async () => {
  let attempts = 0;
  const { controller, errors } = setup({
    onLeave: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('sin red');
    },
  });
  controller.open();
  assert.equal(await controller.leave(), false);
  assert.deepEqual(errors, ['sin red']);
  assert.equal(controller.isOpen, true);
  assert.equal(await controller.leave(), true);
  assert.equal(attempts, 2);
});

test('Esc y el botón Atrás alternan la confirmación', () => {
  const { calls, controller, target } = setup();
  press(target, 'Escape');
  assert.equal(controller.isOpen, true);
  press(target, 'Escape');
  assert.equal(controller.isOpen, false);
  controller.toggle();
  controller.toggle();
  press(target, 'KeyP');
  assert.deepEqual(calls, ['open', 'close', 'open', 'close']);
});

test('destroy cierra la confirmación y deja de escuchar el teclado', () => {
  const { calls, controller, target } = setup();
  controller.open();
  controller.destroy();
  press(target, 'Escape');
  assert.equal(controller.open(), false);
  assert.deepEqual(calls, ['open', 'close']);
});

test('CoopGateway.leave libera la presencia e informa si el compañero sigue conectado', async () => {
  const handlers = {};
  let presenceStopped = false;
  const repository = {
    watchPlayers: (_code, listener) => { handlers.players = listener; return () => {}; },
    watchGameEvents: () => () => {},
    watchPresence: () => async () => { presenceStopped = true; },
  };
  const gateway = new CoopGateway({ roomRepository: repository, code: 'ABCDE', uid: 'a', hostUid: 'a' });
  handlers.players({ a: { connected: true }, b: { connected: true } });
  assert.deepEqual(await gateway.leave(), { peerOnline: true });
  assert.equal(presenceStopped, true);

  const alone = new CoopGateway({ roomRepository: repository, code: 'ABCDE', uid: 'a', hostUid: 'a' });
  handlers.players({ a: { connected: true }, b: { connected: false } });
  assert.deepEqual(await alone.leave(), { peerOnline: false });
});
