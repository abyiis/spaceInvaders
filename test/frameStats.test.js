import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFrameStats } from '../src/core/frameStats.js';

const feed = (stats, durations, start = 1000) => {
  let time = start;
  stats.frame(time);
  for (const duration of durations) {
    time += duration;
    stats.frame(time);
  }
  return time;
};

test('sin frames todo vale cero', () => {
  assert.deepEqual(createFrameStats().snapshot(), {
    fps: 0, averageMs: 0, worstMs: 0, slowPercent: 0, frames: 0,
  });
});

test('60 FPS estables: 60 fps, sin frames lentos', () => {
  const stats = createFrameStats();
  feed(stats, Array.from({ length: 120 }, () => 1000 / 60));
  const snapshot = stats.snapshot();
  assert.ok(Math.abs(snapshot.fps - 60) < 0.01);
  assert.ok(Math.abs(snapshot.averageMs - 16.667) < 0.01);
  assert.equal(snapshot.slowPercent, 0);
  assert.equal(snapshot.frames, 120);
});

test('un tirón se refleja en el peor frame y en el porcentaje de frames lentos', () => {
  const stats = createFrameStats();
  const durations = Array.from({ length: 99 }, () => 16);
  durations.push(80);
  feed(stats, durations);
  const snapshot = stats.snapshot();
  assert.equal(snapshot.worstMs, 80);
  assert.equal(snapshot.slowPercent, 1);
  assert.ok(snapshot.averageMs > 16.5 && snapshot.averageMs < 17);
});

test('solo cuenta la ventana reciente', () => {
  const stats = createFrameStats({ windowMs: 1000 });
  const end = feed(stats, Array.from({ length: 100 }, () => 50));
  feed(stats, Array.from({ length: 200 }, () => 10), end);
  const snapshot = stats.snapshot();
  assert.ok(snapshot.fps > 95 && snapshot.fps <= 100.5, `fps ${snapshot.fps}`);
  assert.equal(snapshot.slowPercent, 0);
});

test('reset descarta lo medido y marcas repetidas se ignoran', () => {
  const stats = createFrameStats();
  stats.frame(100);
  stats.frame(100);
  stats.frame(116);
  assert.equal(stats.snapshot().frames, 1);
  stats.reset();
  assert.equal(stats.snapshot().frames, 0);
});
