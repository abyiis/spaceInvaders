import { SPLASH_DURATION_MS, SPLASH_SKIP_AFTER_MS } from '../uiConstants.js';

/**
 * @param {{
 *   onComplete: () => void,
 *   now?: () => number,
 *   setTimeoutFn?: typeof setTimeout,
 *   clearTimeoutFn?: typeof clearTimeout,
 *   durationMs?: number,
 *   skipAfterMs?: number,
 * }} options
 * @returns {{ skip(): boolean, cancel(): void }}
 */
export function createSplashController({
  onComplete,
  now = () => Date.now(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  durationMs = SPLASH_DURATION_MS,
  skipAfterMs = SPLASH_SKIP_AFTER_MS,
}) {
  const startedAt = now();
  let completed = false;
  const timer = setTimeoutFn(complete, durationMs);

  function complete() {
    if (completed) return;
    completed = true;
    clearTimeoutFn(timer);
    onComplete();
  }

  return {
    skip() {
      if (completed || now() - startedAt < skipAfterMs) return false;
      complete();
      return true;
    },
    cancel() {
      if (completed) return;
      completed = true;
      clearTimeoutFn(timer);
    },
  };
}

/**
 * @param {HTMLElement} container
 * @param {object} _params
 * @param {{ show(name: string): void }} nav
 * @returns {() => void}
 */
export function mountSplash(container, _params, nav) {
  const section = document.createElement('section');
  section.className = 'app-screen splash-screen screen-enter';
  section.tabIndex = -1;
  section.setAttribute('aria-labelledby', 'splash-title');
  section.innerHTML = `
    <div class="splash-screen__content">
      <svg class="splash-screen__ship" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M24 4 42 42 24 34 6 42 24 4Z" fill="#4fc3f7" />
        <path d="m24 19 4 10-4-2-4 2 4-10Z" fill="#0b0e1a" />
      </svg>
      <h1 id="splash-title">SPACE COOP</h1>
      <p>Arcade cooperativo</p>
      <div class="splash-screen__progress" aria-hidden="true">
        <span></span>
      </div>
    </div>
  `;
  container.append(section);
  section.focus();

  const controller = createSplashController({
    onComplete: () => nav.show('home'),
  });
  const onPointerDown = () => controller.skip();
  const onClick = () => controller.skip();
  const onKeyDown = () => controller.skip();
  section.addEventListener('pointerdown', onPointerDown);
  section.addEventListener('click', onClick);
  window.addEventListener('keydown', onKeyDown);

  return () => {
    controller.cancel();
    section.removeEventListener('pointerdown', onPointerDown);
    section.removeEventListener('click', onClick);
    window.removeEventListener('keydown', onKeyDown);
    section.remove();
  };
}
