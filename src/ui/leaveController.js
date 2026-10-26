/**
 * Salida de una partida cooperativa a mitad de partida. No hay pausa en coop (la simulación va
 * atada al reloj del servidor), así que el diálogo «¿Salir de la partida?» se muestra sobre el
 * juego, que sigue en marcha. Ver `.spec/ui_screens.md` §9.
 *
 * @param {{
 *   game: { isGameOver: boolean, sync: { isCoop: boolean } },
 *   onOpen: () => void,
 *   onClose: () => void,
 *   onLeave: () => Promise<void> | void,
 *   onError?: (error: Error) => void,
 *   eventTarget?: EventTarget,
 * }} options
 * @returns {{ open(): boolean, stay(): boolean, toggle(): boolean, leave(): Promise<boolean>,
 *   readonly isOpen: boolean, destroy(): void }}
 */
export function createLeaveController({
  game,
  onOpen,
  onClose,
  onLeave,
  onError = (error) => console.error('No se pudo salir de la partida:', error),
  eventTarget = globalThis.window,
}) {
  let isOpen = false;
  let leaving = false;
  let destroyed = false;

  const closeDialog = () => {
    if (!isOpen) return false;
    isOpen = false;
    onClose();
    return true;
  };

  const controller = {
    /** Abre la confirmación. No aplica en solitario (ahí está la pausa) ni tras el Game Over. */
    open() {
      if (destroyed || isOpen || leaving || game.isGameOver || !game.sync.isCoop) return false;
      isOpen = true;
      onOpen();
      return true;
    },

    /** «Seguir jugando»: cierra la confirmación. */
    stay() {
      if (destroyed || leaving) return false;
      return closeDialog();
    },

    /** Esc y «Atrás» de Android: abre la confirmación o, si ya está abierta, la cierra. */
    toggle() {
      return isOpen ? controller.stay() : controller.open();
    },

    /** «Salir»: abandona la sala y vuelve al inicio. Una sola vez; si falla, la confirmación sigue abierta. */
    async leave() {
      if (destroyed || !isOpen || leaving) return false;
      leaving = true;
      try {
        await onLeave();
        return true;
      } catch (error) {
        leaving = false;
        onError(error instanceof Error ? error : new Error(String(error)));
        return false;
      }
    },

    get isOpen() {
      return isOpen;
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      closeDialog();
      eventTarget?.removeEventListener('keydown', onKeyDown);
    },
  };

  const onKeyDown = (event) => {
    if (event.code !== 'Escape') return;
    event.preventDefault();
    controller.toggle();
  };

  eventTarget?.addEventListener('keydown', onKeyDown);
  return controller;
}
