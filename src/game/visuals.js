// Valores y funciones puras de los indicadores visuales. Ver `.spec/visual_feedback.md`.

export const VISUALS = Object.freeze({
  BANNER_DURATION: 0.5,
  BANNER_HEIGHT: 56,
  /** Entrada de los enemigos: duración por enemigo, escalonado por rejilla y altura de partida. */
  ENTRANCE_DURATION: 0.5,
  ENTRANCE_ROW_DELAY: 0.08,
  ENTRANCE_COLUMN_DELAY: 0.04,
  ENTRANCE_DROP: 220,
  /** Paleta de las franjas centrales. */
  BANNER_STYLES: Object.freeze({
    wave: Object.freeze({ fill: 'rgba(11, 26, 58, 0.88)', edge: '#67f5d5', text: '#ffffff' }),
    bonus: Object.freeze({ fill: 'rgba(58, 42, 5, 0.9)', edge: '#ffd166', text: '#ffd166' }),
  }),
});

const clamp01 = (value) => Math.min(1, Math.max(0, value));
export const easeOutCubic = (t) => 1 - (1 - clamp01(t)) ** 3;
export const easeInCubic = (t) => clamp01(t) ** 3;

/**
 * Progreso (0..1) de la entrada de un enemigo `time` segundos después de empezar la oleada.
 * @param {number} time
 * @param {number} row
 * @param {number} column
 */
export function entranceProgress(time, row, column) {
  const delay = row * VISUALS.ENTRANCE_ROW_DELAY + column * VISUALS.ENTRANCE_COLUMN_DELAY;
  return clamp01((time - delay) / VISUALS.ENTRANCE_DURATION);
}

/**
 * Posición de la franja en el instante `progress` (0..1) de su animación: entra por la izquierda
 * (25 %), se mantiene centrada (50 %) y sale por la derecha (25 %). Con movimiento reducido no se
 * desplaza: aparece y desaparece con un fundido.
 *
 * @param {number} progress
 * @param {number} width Ancho del lienzo.
 * @param {boolean} [reducedMotion]
 * @returns {{ offsetX: number, alpha: number }}
 */
export function bannerFrame(progress, width, reducedMotion = false) {
  const p = clamp01(progress);
  if (reducedMotion) {
    const alpha = p < 0.25 ? p / 0.25 : p > 0.75 ? (1 - p) / 0.25 : 1;
    return { offsetX: 0, alpha };
  }
  if (p < 0.25) return { offsetX: -width * (1 - easeOutCubic(p / 0.25)), alpha: 1 };
  if (p <= 0.75) return { offsetX: 0, alpha: 1 };
  return { offsetX: width * easeInCubic((p - 0.75) / 0.25), alpha: 1 };
}

/** Dibuja una franja centrada con su texto. */
export function drawBanner(ctx, { text, kind }, progress, { width, height, reducedMotion = false }) {
  const style = VISUALS.BANNER_STYLES[kind] ?? VISUALS.BANNER_STYLES.wave;
  const { offsetX, alpha } = bannerFrame(progress, width, reducedMotion);
  const top = height / 2 - VISUALS.BANNER_HEIGHT / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = style.fill;
  ctx.fillRect(offsetX, top, width, VISUALS.BANNER_HEIGHT);
  ctx.fillStyle = style.edge;
  ctx.fillRect(offsetX, top, width, 2);
  ctx.fillRect(offsetX, top + VISUALS.BANNER_HEIGHT - 2, width, 2);
  ctx.fillStyle = style.text;
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2 + offsetX, height / 2 + 1);
  ctx.restore();
}
