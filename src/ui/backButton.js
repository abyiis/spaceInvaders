/**
 * @param {{ current: string | null, back(): boolean }} router
 * @param {{ exitApp: () => void | Promise<void>, onPlayingBack: () => void }} actions
 * @returns {boolean}
 */
export function handleBackButton(router, { exitApp, onPlayingBack }) {
  switch (router.current) {
    case 'splash':
      return false;
    case 'home':
      exitApp();
      return true;
    case 'credits':
    case 'results':
      return router.back();
    case 'playing':
      onPlayingBack();
      return true;
    default:
      return router.back();
  }
}

/**
 * @param {{ current: string | null, back(): boolean }} router
 * @param {{
 *   app: { addListener(event: 'backButton', listener: () => void): Promise<{ remove(): Promise<void> | void }> },
 *   exitApp?: () => void | Promise<void>,
 *   onPlayingBack?: () => void,
 *   onError?: (error: Error) => void,
 * }} options
 * @returns {() => Promise<void>}
 */
export function attachBackButton(router, {
  app,
  exitApp = () => app.exitApp(),
  onPlayingBack = () => {},
  onError = (error) => console.error('No se pudo gestionar el botón Atrás:', error),
}) {
  const reportError = (error) => {
    onError(error instanceof Error ? error : new Error(String(error)));
  };

  const onBackButton = () => {
    try {
      const safeExitApp = () => {
        const result = exitApp();
        if (result && typeof result.then === 'function') {
          result.catch(reportError);
        }
      };
      const handled = handleBackButton(router, {
        exitApp: safeExitApp,
        onPlayingBack,
      });
      if (handled && typeof handled.then === 'function') {
        handled.catch(reportError);
      }
    } catch (error) {
      reportError(error);
    }
  };

  let registration;
  try {
    registration = Promise.resolve(app.addListener('backButton', onBackButton));
  } catch (error) {
    reportError(error);
    return async () => {};
  }

  const ready = registration.catch((error) => {
    reportError(error);
    return null;
  });

  return async () => {
    try {
      const listener = await ready;
      await listener?.remove();
    } catch (error) {
      reportError(error);
    }
  };
}
