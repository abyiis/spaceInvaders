const DEFAULT_BACK_TARGETS = Object.freeze({
  credits: 'home',
  results: 'home',
});

/**
 * @typedef {(container: HTMLElement, params: object, nav: ScreenRouter) => (() => void)} ScreenMount
 * @typedef {string | ((params: object) => string)} BackTarget
 * @typedef {{ show(name: string, params?: object): void, back(): boolean,
 *             readonly current: string | null, destroy(): void }} ScreenRouter
 */

/**
 * @param {{
 *   container: HTMLElement,
 *   screens: Record<string, ScreenMount>,
 *   backTargets?: Record<string, BackTarget>,
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
  let currentParams = {};
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
      currentParams = params;
    },

    back() {
      const backTarget = Object.prototype.hasOwnProperty.call(backTargets, current)
        ? backTargets[current]
        : null;
      if (!backTarget) {
        return false;
      }
      const target = typeof backTarget === 'function'
        ? backTarget(currentParams)
        : backTarget;
      if (typeof target !== 'string' || !target) return false;

      const params = typeof backTarget === 'function' ? currentParams : {};
      router.show(target, params);
      return true;
    },

    get current() {
      return current;
    },

    destroy() {
      const unmount = unmountCurrent;
      unmountCurrent = null;
      current = null;
      currentParams = {};
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
