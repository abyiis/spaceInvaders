/**
 * Entrada de usuario: arrastre/toques (Pointer Events) y teclado.
 * Es el único módulo de `game/` que toca el DOM.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {import('./Game.js').Game} game
 * @returns {() => void} Función para quitar los listeners.
 */
export function attachInput(canvas, game) {
  let activePointerId = null;
  let lastLogicalX = 0;

  /** Convierte un clientX a coordenadas lógicas del juego. */
  const toLogicalX = (clientX) => {
    const rect = canvas.getBoundingClientRect();
    return ((clientX - rect.left) * game.width) / rect.width;
  };

  const onPointerDown = (e) => {
    e.preventDefault();
    if (game.isGameOver) {
      game.startNewGame();
      return;
    }
    activePointerId = e.pointerId;
    lastLogicalX = toLogicalX(e.clientX);
    canvas.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (e.pointerId !== activePointerId || game.isGameOver) return;
    const x = toLogicalX(e.clientX);
    game.player.moveBy(x - lastLogicalX);
    lastLogicalX = x;
  };

  const onPointerEnd = (e) => {
    if (e.pointerId === activePointerId) activePointerId = null;
  };

  const keys = new Set();
  const updateKeyboardDirection = () => {
    const left = keys.has('ArrowLeft') || keys.has('KeyA');
    const right = keys.has('ArrowRight') || keys.has('KeyD');
    game.player.moveDir = (right ? 1 : 0) - (left ? 1 : 0);
  };

  const onKeyDown = (e) => {
    if (game.isGameOver && (e.code === 'Space' || e.code === 'Enter')) {
      game.startNewGame();
      return;
    }
    keys.add(e.code);
    updateKeyboardDirection();
  };

  const onKeyUp = (e) => {
    keys.delete(e.code);
    updateKeyboardDirection();
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerEnd);
  canvas.addEventListener('pointercancel', onPointerEnd);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerEnd);
    canvas.removeEventListener('pointercancel', onPointerEnd);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  };
}
