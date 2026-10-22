import { RESULTS_DELAY_MS } from '../uiConstants.js';

/**
 * @param {number} score
 * @returns {string}
 */
export function formatScore(score) {
  return Math.trunc(score).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * @param {number} durationSeconds
 * @returns {string}
 */
export function formatDuration(durationSeconds) {
  const totalSeconds = Math.max(0, Math.floor(durationSeconds));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Delays results navigation and ignores a game-over callback after leaving play.
 *
 * @param {{ current: string | null, show(name: string, params?: object): void }} router
 * @param {{ mode: string, score: number, wave: number, durationSeconds: number }} result
 * @param {{ setTimeoutFn?: typeof setTimeout, clearTimeoutFn?: typeof clearTimeout, delayMs?: number }} [options]
 * @returns {() => void}
 */
export function scheduleResultsNavigation(router, result, {
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  delayMs = RESULTS_DELAY_MS,
} = {}) {
  let cancelled = false;
  const timer = setTimeoutFn(() => {
    if (!cancelled && router.current === 'playing') {
      router.show('results', { result });
    }
  }, delayMs);

  return () => {
    cancelled = true;
    clearTimeoutFn(timer);
  };
}

/**
 * @param {HTMLElement} container
 * @param {{ result: { score: number, wave: number, durationSeconds: number } }} params
 * @param {{ show(name: string, params?: object): void }} nav
 * @returns {() => void}
 */
export function mountResults(container, { result }, nav) {
  const screen = document.createElement('section');
  screen.className = 'app-screen results-screen screen-enter';
  screen.setAttribute('aria-labelledby', 'results-title');
  screen.innerHTML = `
    <div class="results-screen__panel">
      <p class="main-menu__eyebrow">Partida finalizada</p>
      <h1 id="results-title">Fin de la partida</h1>
      <p class="results-screen__score" aria-label="Puntaje">
        <span data-result-score></span>
        <span class="results-screen__score-label">puntos</span>
      </p>
      <dl class="results-screen__details">
        <div><dt>Oleada alcanzada</dt><dd data-result-wave></dd></div>
        <div><dt>Tiempo</dt><dd data-result-duration></dd></div>
      </dl>
      <div class="results-screen__actions">
        <button class="main-menu__button main-menu__button--primary" type="button" data-action="replay">
          Jugar de nuevo
        </button>
        <button class="main-menu__button main-menu__button--secondary" type="button" data-action="home">
          Inicio
        </button>
      </div>
    </div>
  `;

  screen.querySelector('[data-result-score]').textContent = formatScore(result.score);
  screen.querySelector('[data-result-wave]').textContent = String(result.wave);
  screen.querySelector('[data-result-duration]').textContent = formatDuration(result.durationSeconds);
  screen.querySelector('[data-action="replay"]').addEventListener('click', () => nav.show('playing'));
  screen.querySelector('[data-action="home"]').addEventListener('click', () => nav.show('home'));
  container.append(screen);
  screen.querySelector('[data-action="replay"]').focus();

  return () => screen.remove();
}
