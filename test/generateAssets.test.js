import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { encodePng } from '../scripts/generateAssets.mjs';

test('encodePng produce un PNG RGBA válido que se descomprime a los mismos píxeles', () => {
  const size = 4;
  const pixels = Uint8Array.from({ length: size * size * 4 }, (_, index) => (index * 7) % 256);
  const png = encodePng(size, pixels);

  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  assert.equal(png.readUInt32BE(16), size);
  assert.equal(png.readUInt32BE(20), size);
  assert.equal(png[25], 6);
  const idatStart = png.indexOf('IDAT') + 4;
  const idatLength = png.readUInt32BE(idatStart - 8);
  const raw = inflateSync(png.subarray(idatStart, idatStart + idatLength));
  const stride = size * 4 + 1;
  for (let y = 0; y < size; y += 1) {
    assert.equal(raw[y * stride], 0);
    assert.deepEqual(
      [...raw.subarray(y * stride + 1, (y + 1) * stride)],
      [...pixels.subarray(y * size * 4, (y + 1) * size * 4)],
    );
  }
  assert.equal(png.toString('ascii', png.length - 8, png.length - 4), 'IEND');
});

test('los recursos generados existen con las dimensiones que pide @capacitor/assets', () => {
  const dimensions = {
    'icon-only.png': 1024,
    'icon-foreground.png': 1024,
    'icon-background.png': 1024,
    'splash.png': 2732,
    'splash-dark.png': 2732,
  };
  for (const [name, size] of Object.entries(dimensions)) {
    const png = readFileSync(new URL(`../assets/${name}`, import.meta.url));
    assert.equal(png.readUInt32BE(16), size, name);
    assert.equal(png.readUInt32BE(20), size, name);
  }
});
