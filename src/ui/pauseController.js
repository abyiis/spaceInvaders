/**
 * @param {{
 *   game: { paused: boolean, isGameOver: boolean, sync: { isCoop: boolean }, pause(): void, resume(): void },
 *   attachInput: () => () => void,
 *   detachInput: () => void,
 *   onOpen: () => void,
 *   onClose: () => void,
 *   onExit: () => void,
 *   eventTarget?: EventTarget,
 * }} options
 * @returns {{ open(): boolean, resume(): boolean, exit(): boolean, destroy(): void }}
 */
export function createPauseController({
  game,
  attachInput,
  detachInput,
  onOpen,
  onClose,
  onExit,
  eventTarget = globalThis.window,
}) {
  let isOpen = false;
  let destroyed = false;
  let detachKeyboard = null;
  let detachCurrentInput = detachInput;

  const closeMenu = () => {
    if (!isOpen) return false;
    isOpen = false;
    onClose();
    return true;
  };

  const controller = {
    open() {
      if (destroyed || isOpen || game.isGameOver || game.sync.isCoop) return false;
      game.pause();
      if (!game.paused) return false;
      detachCurrentInput();
      detachCurrentInput = null;
      isOpen = true;
      onOpen();
      return true;
    },

    resume() {
      if (destroyed || !closeMenu()) return false;
      game.resume();
      detachCurrentInput = attachInput();
      return true;
    },

    exit() {
      if (destroyed || !closeMenu()) return false;
      onExit();
      return true;
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      closeMenu();
      detachCurrentInput?.();
      detachCurrentInput = null;
      eventTarget?.removeEventListener('keydown', onKeyDown);
      detachKeyboard?.();
    },
  };

  const onKeyDown = (event) => {
    if (event.code !== 'Escape' && event.code !== 'KeyP') return;
    event.preventDefault();
    if (isOpen) controller.resume();
    else controller.open();
  };

  eventTarget?.addEventListener('keydown', onKeyDown);
  return controller;
}
