import { C } from '../core/constants.js';

/**
 * Fondo decorativo de estrellas en parallax: varias capas que caen a distinta velocidad.
 * `update(dt)` no toca el DOM; `render(ctx)` recibe el contexto. Ver `.spec/game_loop.md` §3.1.
 */
export class Starfield {
  /**
   * @param {{
   *   width?: number,
   *   height?: number,
   *   random?: () => number,
   *   layers?: ReadonlyArray<{count: number, speed: number, size: number, alpha: number}>,
   * }} [opts]
   *   `random` debe devolver un número en [0, 1) y es independiente del azar de la partida.
   */
  constructor({
    width = C.WIDTH,
    height = C.HEIGHT,
    random = Math.random,
    layers = C.STAR_LAYERS,
  } = {}) {
    this.width = width;
    this.height = height;
    this.random = random;
    this.layers = layers;
    /** @type {{x: number, y: number, layer: number}[]} */
    this.stars = [];

    layers.forEach((layer, index) => {
      for (let i = 0; i < layer.count; i++) {
        this.stars.push({
          x: this.random() * width,
          y: this.random() * height,
          layer: index,
        });
      }
    });
  }

  /** @param {number} dt Segundos desde el frame anterior. */
  update(dt) {
    for (const star of this.stars) {
      star.y += this.layers[star.layer].speed * dt;
      if (star.y >= this.height) {
        // Reaparece arriba con una x nueva; conserva el sobrante para no formar filas.
        star.y -= this.height;
        star.x = this.random() * this.width;
      }
    }
  }

  /** @param {CanvasRenderingContext2D} ctx */
  render(ctx) {
    // Se agrupa por capa: un solo fillStyle por capa en vez de uno por estrella.
    this.layers.forEach((layer, index) => {
      ctx.fillStyle = `rgba(255, 255, 255, ${layer.alpha})`;
      for (const star of this.stars) {
        if (star.layer === index) ctx.fillRect(star.x, star.y, layer.size, layer.size);
      }
    });
  }
}