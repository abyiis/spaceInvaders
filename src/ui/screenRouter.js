const DEFAULT_BACK_TARGETS = Object.freeze({
  credits: 'home',
  results: 'home',
});

/**
 * @typedef {(container: HTMLElement, params: object, nav: ScreenRouter) => (() => void)} ScreenMount
 * @typedef {{ show(name: string, params?: object): void, back(): boolean,
 *             readonly current: string | null, destroy(): void }} ScreenRouter
 */

/**
 * @param {{
 *   container: HTMLElement,
 *   screens: Record<string, ScreenMount>,
 *   backTargets?: Record<string, string>,
 * }} options
 * @returns {ScreenRouter}
 */
export function createScreenRouter({ container, screens, backTargets = DEFAULT_BACK_TARGETS }) {
  if (!container) {
    throw new TypeError('createScreenRouter requires a container');
  }
  if (!screens || typeof screens !== 'object') {
    throw new TypeError('createScreenRouter requires a screens object');
  }

  let current = null;
  let unmountCurrent = null;

  const router = {
    show(name, params = {}) {
      const mount = screens[name];
      if (!Object.prototype.hasOwnProperty.call(screens, name) || typeof mount !== 'function') {
        throw new Error(`Unknown screen: ${name}`);
      }

      const unmount = unmountCurrent;
      unmountCurrent = null;
      current = null;
      if (unmount) {
        unmount();
      }

      const nextUnmount = mount(container, params, router);
      if (typeof nextUnmount !== 'function') {
        throw new TypeError(`Screen "${name}" must return an unmount function`);
      }

      unmountCurrent = nextUnmount;
      current = name;
    },

    back() {
      const target = Object.prototype.hasOwnProperty.call(backTargets, current)
        ? backTargets[current]
        : null;
      if (!target) {
        return false;
      }
      router.show(target);
      return true;
    },

    get current() {
      return current;
    },

    destroy() {
      const unmount = unmountCurrent;
      unmountCurrent = null;
      current = null;
      if (unmount) {
        unmount();
      }
    },
  };

  return router;
}

export const SCREENS = Object.freeze({
  SPLASH: 'splash',
  HOME: 'home',
  CREDITS: 'credits',
  PLAYING: 'playing',
  RESULTS: 'results',
});
