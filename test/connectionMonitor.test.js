import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConnectionMonitor } from '../src/core/connectionMonitor.js';
import { createPositionPublisher } from '../src/core/positionPublisher.js';

const setup = () => {
  let time = 0;
  const monitor = createConnectionMonitor({ now: () => time });
  return { monitor, advance: (ms) => { time += ms; } };
};

test('con todo conectado y señales recientes el estado es normal', () => {
  const { monitor, advance } = setup();
  monitor.setPeerConnected(true);
  advance(3000);
  monitor.notePeerSignal();
  advance(3000);
  assert.deepEqual(monitor.status(), { kind: 'ok', message: '' });
});

test('más de 5 s sin señales del compañero conectado se avisa de conexión inestable', () => {
  const { monitor, advance } = setup();
  monitor.setPeerConnected(true);
  advance(5000);
  assert.equal(monitor.status().kind, 'ok');
  advance(1);
  assert.deepEqual(monitor.status(), { kind: 'unstable', message: 'Conexión inestable' });
  monitor.notePeerSignal();
  assert.equal(monitor.status().kind, 'ok');
});

test('perder la conexión propia siempre se avisa y al volver se espera una señal nueva', () => {
  const { monitor, advance } = setup();
  monitor.setPeerConnected(true);
  advance(20_000);
  monitor.setLocalOnline(false);
  assert.equal(monitor.status().kind, 'unstable');
  monitor.setLocalOnline(true);
  assert.equal(monitor.status().kind, 'ok');
});

test('compañero desconectado: cuenta atrás de 10 s y luego fuera de la partida', () => {
  const { monitor, advance } = setup();
  monitor.setPeerConnected(true);
  monitor.setPeerConnected(false);
  assert.deepEqual(monitor.status(), {
    kind: 'peer-offline',
    secondsLeft: 10,
    message: 'Compañero desconectado · se retira en 10 s',
  });
  advance(3500);
  assert.equal(monitor.status().secondsLeft, 7);
  advance(6499);
  assert.equal(monitor.status().kind, 'peer-offline');
  advance(1);
  assert.deepEqual(monitor.status(), { kind: 'peer-gone', message: 'Tu compañero salió de la partida' });
});

test('si el compañero vuelve antes de los 10 s el aviso desaparece', () => {
  const { monitor, advance } = setup();
  monitor.setPeerConnected(false);
  advance(8000);
  monitor.setPeerConnected(true);
  assert.equal(monitor.status().kind, 'ok');
  advance(9000);
  assert.equal(monitor.status().kind, 'unstable');
});

test('repetir connected=false no reinicia la cuenta atrás', () => {
  const { monitor, advance } = setup();
  monitor.setPeerConnected(false);
  advance(6000);
  monitor.setPeerConnected(false);
  assert.equal(monitor.status().secondsLeft, 4);
});

test('el publicador envía un latido cada 2 s aunque la nave no se mueva', () => {
  let time = 0;
  const published = [];
  const publisher = createPositionPublisher({ now: () => time, publish: (x) => published.push([time, x]) });
  publisher.update(0.5);
  for (let frame = 0; frame < 60 * 7; frame += 1) {
    time += 1000 / 60;
    publisher.update(0.5);
  }
  assert.ok(published.length >= 3 && published.length <= 5, `latidos: ${published.length}`);
  for (let index = 1; index < published.length; index += 1) {
    assert.ok(published[index][0] - published[index - 1][0] >= 2000);
  }
});
