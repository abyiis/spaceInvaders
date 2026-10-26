import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTrafficMeter, estimateMessageBytes, MESSAGE_OVERHEAD_BYTES } from '../src/core/trafficMeter.js';
import { CoopGateway } from '../src/game/CoopGateway.js';

test('estima el tamaño de un mensaje con su ruta, carga y margen de protocolo', () => {
  const payload = { x: 0.5, ts: 1700000000000 };
  assert.equal(
    estimateMessageBytes('rooms/ABCDE/players/uid', payload),
    'rooms/ABCDE/players/uid'.length + JSON.stringify(payload).length + MESSAGE_OVERHEAD_BYTES,
  );
  assert.equal(estimateMessageBytes('a'), 1 + MESSAGE_OVERHEAD_BYTES);
});

test('suma lo enviado y lo recibido por categoría', () => {
  let time = 0;
  const meter = createTrafficMeter({ now: () => time });
  meter.record('sent', 100, 'posición');
  meter.record('sent', 50, 'posición');
  meter.record('received', 400, 'eventos');
  time = 2000;
  const snapshot = meter.snapshot();
  assert.equal(snapshot.totalSent, 150);
  assert.equal(snapshot.totalReceived, 400);
  assert.deepEqual(snapshot.byLabel, {
    posición: { sent: 150, received: 0 },
    eventos: { sent: 0, received: 400 },
  });
  assert.equal(snapshot.elapsedSeconds, 2);
  assert.equal(snapshot.averageSentPerSecond, 75);
  assert.equal(snapshot.averageReceivedPerSecond, 200);
});

test('la tasa reciente solo mira la ventana y la media mira toda la sesión', () => {
  let time = 0;
  const meter = createTrafficMeter({ now: () => time, windowMs: 10_000 });
  for (let second = 0; second < 30; second += 1) {
    time = second * 1000;
    meter.record('received', second < 20 ? 1000 : 100);
  }
  time = 30_000;
  const snapshot = meter.snapshot();
  assert.ok(Math.abs(snapshot.receivedPerSecond - 100) < 1, `reciente ${snapshot.receivedPerSecond}`);
  assert.ok(snapshot.averageReceivedPerSecond > 600);
});

test('proyecta el tráfico de una partida a partir del ritmo medio', () => {
  let time = 0;
  const meter = createTrafficMeter({ now: () => time });
  meter.record('sent', 1000);
  meter.record('received', 3000);
  time = 10_000;
  assert.equal(meter.projectedBytes(600), (100 + 300) * 600);
});

test('ignora registros inválidos y reset vacía el contador', () => {
  const meter = createTrafficMeter({ now: () => 0 });
  meter.record('enviado', 10);
  meter.record('sent', -5);
  meter.record('sent', Number.NaN);
  assert.equal(meter.snapshot().totalSent, 0);
  meter.record('sent', 10);
  meter.reset();
  assert.equal(meter.snapshot().totalSent, 0);
});

test('CoopGateway cuenta lo que envía y recibe', async () => {
  let time = 0;
  const handlers = {};
  const repository = {
    watchPlayers: (_code, listener) => { handlers.players = listener; return () => {}; },
    watchGameEvents: (_code, listener) => { handlers.events = listener; return () => {}; },
    watchPresence: () => async () => {},
    publishPlayerX: async () => {},
    emitGameEvent: async () => {},
  };
  const gateway = new CoopGateway({
    roomRepository: repository, code: 'ABCDE', uid: 'a', hostUid: 'a', now: () => time,
  });
  gateway.publishPlayerX(0.4);
  gateway.emitShot(1.5, 0.4, 1, 0);
  handlers.events('e1', { uid: 'b', type: 'shot', t: 1, x: 0.5 });
  handlers.events('own', { uid: 'a', type: 'shot', t: 1, x: 0.5 });
  handlers.players({ a: { x: 0.4, ts: 1, connected: true }, b: { x: 0.6, ts: 2, connected: true } });
  time = 1000;

  const { byLabel, totalSent, totalReceived } = gateway.traffic.snapshot();
  assert.ok(byLabel.posición.sent > 0);
  assert.ok(byLabel.eventos.sent > 0);
  assert.ok(byLabel.eventos.received > 0);
  assert.ok(byLabel.posición.received > 0);
  assert.ok(totalSent > 0 && totalReceived > 0);

  // La segunda actualización idéntica del compañero no añade tráfico.
  const before = gateway.traffic.snapshot().totalReceived;
  handlers.players({ a: { x: 0.4, ts: 1, connected: true }, b: { x: 0.6, ts: 2, connected: true } });
  assert.equal(gateway.traffic.snapshot().totalReceived, before);
  gateway.dispose();
});
