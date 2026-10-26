// Genera el ícono y la pantalla de arranque nativa (PNG) a partir de la nave del splash de la app.
// Uso: npm run assets
//
// Escribe en `assets/` los nombres que espera `@capacitor/assets`:
//   icon-only.png        1024×1024  ícono completo (fondo + nave)
//   icon-foreground.png  1024×1024  nave sobre transparente (ícono adaptable de Android)
//   icon-background.png  1024×1024  fondo del ícono adaptable
//   splash.png / splash-dark.png  2732×2732  pantalla de arranque
// Después de `npx cap add android`: npx @capacitor/assets generate --android (ver docs/entrega.md).
// No hay dependencias: el PNG se codifica a mano con zlib.

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { mulberry32 } from '../src/core/prng.js';

const OUTPUT_DIRECTORY = fileURLToPath(new URL('../assets/', import.meta.url));
const BACKGROUND = [5, 8, 17];
const PANEL = [11, 18, 34];
const ACCENT = [103, 245, 213];
const COCKPIT = [11, 14, 38];

// Nave pixel-art del splash de la app (`src/ui/screens/splash.js`), en una cuadrícula de 48 × 48.
const SHIP_OUTLINE = [
  [8, 14], [16, 14], [16, 8], [32, 8], [32, 14], [40, 14], [40, 28], [34, 28], [34, 36],
  [26, 36], [26, 30], [22, 30], [22, 36], [14, 36], [14, 28], [8, 28],
];
const SHIP_EYES = [
  [[16, 20], [20, 20], [20, 26], [16, 26]],
  [[28, 20], [32, 20], [32, 26], [28, 26]],
];
const SHIP_ARROW = [[24, 19], [28, 29], [24, 27], [20, 29]];
const SHIP_BOUNDS = { minX: 8, maxX: 40, minY: 8, maxY: 36 };

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

/** Codifica píxeles RGBA (Uint8Array de `size × size × 4`) como PNG. */
export function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // profundidad de bits
  header[9] = 6; // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filtro "ninguno"
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function insidePolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Color de la nave en el punto `(gx, gy)` de la cuadrícula de 48, o `null` si no hay nave. */
function shipColorAt(gx, gy) {
  if (!insidePolygon(gx, gy, SHIP_OUTLINE)) return null;
  if (SHIP_EYES.some((eye) => insidePolygon(gx, gy, eye))) return null;
  return insidePolygon(gx, gy, SHIP_ARROW) ? COCKPIT : ACCENT;
}

const mix = (a, b, t) => a.map((value, index) => Math.round(value + (b[index] - value) * t));

/**
 * Dibuja un lienzo cuadrado.
 * @param {number} size
 * @param {{ background: 'none' | 'solid' | 'glow', shipSize: number, stars?: number, shipOffsetY?: number }} options
 *   `shipSize`: ancho de la nave como fracción del lienzo.
 */
function render(size, { background, shipSize, stars = 0, shipOffsetY = 0 }) {
  const pixels = new Uint8Array(size * size * 4);
  const centre = size / 2;
  const unit = (size * shipSize) / (SHIP_BOUNDS.maxX - SHIP_BOUNDS.minX);
  const originX = centre - ((SHIP_BOUNDS.minX + SHIP_BOUNDS.maxX) / 2) * unit;
  const originY = centre - ((SHIP_BOUNDS.minY + SHIP_BOUNDS.maxY) / 2) * unit + size * shipOffsetY;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let color = [0, 0, 0];
      let alpha = 0;
      if (background !== 'none') {
        const distance = Math.hypot(x - centre, y - centre) / (size * 0.72);
        color = background === 'glow' ? mix(PANEL, BACKGROUND, Math.min(1, distance)) : BACKGROUND;
        alpha = 255;
      }
      const offset = (y * size + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = alpha;
    }
  }

  const random = mulberry32(48);
  for (let star = 0; star < stars; star += 1) {
    const x = Math.floor(random() * size);
    const y = Math.floor(random() * size);
    const radius = random() < 0.15 ? 2 : 1;
    const brightness = 90 + Math.floor(random() * 120);
    for (let dy = 0; dy < radius * 2; dy += 1) {
      for (let dx = 0; dx < radius * 2; dx += 1) {
        const px = x + dx;
        const py = y + dy;
        if (px >= size || py >= size) continue;
        const offset = (py * size + px) * 4;
        pixels[offset] = brightness;
        pixels[offset + 1] = brightness;
        pixels[offset + 2] = Math.min(255, brightness + 30);
        pixels[offset + 3] = 255;
      }
    }
  }

  if (shipSize <= 0) return pixels;

  // La nave se suaviza con 3 × 3 muestras por píxel, solo dentro de su recuadro.
  const margin = 2;
  const x0 = Math.max(0, Math.floor(originX + SHIP_BOUNDS.minX * unit) - margin);
  const x1 = Math.min(size - 1, Math.ceil(originX + SHIP_BOUNDS.maxX * unit) + margin);
  const y0 = Math.max(0, Math.floor(originY + SHIP_BOUNDS.minY * unit) - margin);
  const y1 = Math.min(size - 1, Math.ceil(originY + SHIP_BOUNDS.maxY * unit) + margin);
  const samples = [1 / 6, 3 / 6, 5 / 6];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      let covered = 0;
      const sum = [0, 0, 0];
      for (const sy of samples) {
        for (const sx of samples) {
          const shipColor = shipColorAt((x + sx - originX) / unit, (y + sy - originY) / unit);
          if (!shipColor) continue;
          covered += 1;
          sum[0] += shipColor[0];
          sum[1] += shipColor[1];
          sum[2] += shipColor[2];
        }
      }
      if (covered === 0) continue;
      const coverage = covered / (samples.length * samples.length);
      const offset = (y * size + x) * 4;
      const baseAlpha = pixels[offset + 3] / 255;
      const outAlpha = coverage + baseAlpha * (1 - coverage);
      for (let channel = 0; channel < 3; channel += 1) {
        const shipChannel = sum[channel] / covered;
        pixels[offset + channel] = Math.round(
          (shipChannel * coverage + pixels[offset + channel] * baseAlpha * (1 - coverage)) / outAlpha,
        );
      }
      pixels[offset + 3] = Math.round(outAlpha * 255);
    }
  }
  return pixels;
}

const ASSETS = [
  // La nave ocupa ~58 % del ícono completo y ~44 % del adaptable (zona segura de Android: 66 %).
  ['icon-only.png', 1024, { background: 'glow', shipSize: 0.58 }],
  ['icon-foreground.png', 1024, { background: 'none', shipSize: 0.44 }],
  ['icon-background.png', 1024, { background: 'glow', shipSize: 0 }],
  ['splash.png', 2732, { background: 'glow', shipSize: 0.2, stars: 260 }],
  ['splash-dark.png', 2732, { background: 'glow', shipSize: 0.2, stars: 260 }],
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  for (const [name, size, options] of ASSETS) {
    const png = encodePng(size, render(size, options));
    writeFileSync(`${OUTPUT_DIRECTORY}${name}`, png);
    console.log(`${name}: ${size}×${size}, ${(png.length / 1024).toFixed(1)} KB`);
  }
}
