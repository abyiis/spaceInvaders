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
        <path d="M8 14h8V8h16v6h8v14h-6v8h-8v-6h-4v6h-8v-8H8V14Zm8 6v6h4v-6h-4Zm12 0v6h4v-6h-4Z" fill="#67f5d5" />
        <path d="m24 19 4 10-4-2-4 2 4-10Z" fill="#0b0e1a" />
      </svg>
      <h1 id="splash-title"><span>NEON</span><span>INVADERS</span></h1>
      <p>LA TIERRA ES TU ÚLTIMA LÍNEA</p>
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
