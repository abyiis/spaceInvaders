/**
 * Pausa el juego cuando la app deja de estar en primer plano.
 * Ver `.spec/architecture.md` §3.2.
 *
 * Escucha dos fuentes porque ninguna cubre todos los casos:
 *  - `visibilitychange` del documento (navegador y WebView).
 *  - `appStateChange` del plugin `@capacitor/app` (Android/iOS: bloqueo de pantalla,
 *    cambio de app, etc.).
 * Las dos solo pausan; reanudar lo decide el jugador con un toque (`input.js`).
 *
 * @typedef {Object} AppPlugin
 * @property {(
 *   event: 'appStateChange',
 *   listener: (state: {isActive: boolean}) => void,
 * ) => Promise<{remove: () => Promise<void> | void}>} addListener
 *
 * @param {import('./game/Game.js').Game} game
 * @param {{doc?: Document, app?: AppPlugin}} [opts]
 *   `doc` y `app` se inyectan para poder probar sin navegador ni Capacitor.
 * @returns {() => void} Función para quitar los listeners.
 */
export function attachLifecycle(game, { doc = globalThis.document, app } = {}) {
  const onVisibilityChange = () => {
    if (doc.visibilityState === 'hidden') game.pause();
  };

  doc?.addEventListener('visibilitychange', onVisibilityChange);

  // Si el plugin no está disponible, la pausa por visibilidad sigue funcionando.
  const appListener = app
    ?.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) game.pause();
    })
    .catch(() => null);

  return () => {
    doc?.removeEventListener('visibilitychange', onVisibilityChange);
    appListener?.then((handle) => handle?.remove());
  };
}