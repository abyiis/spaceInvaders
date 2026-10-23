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
      router.show(result.wave === 1 ? 'credits' : 'results', { result });
    }
  }, delayMs);

  return () => {
    cancelled = true;
    clearTimeoutFn(timer);
  };
}

/**
 * @param {{
 *   saveScore: (result: object) => Promise<void>,
 *   result: object,
 *   onState: (state: { status: 'saving' | 'saved' | 'error', error?: Error }) => void,
 * }} options
 * @returns {{ save(): Promise<void>, dispose(): void }}
 */
export function createScoreSaveController({ saveScore, result, onState }) {
  let disposed = false;
  let saving = false;

  return {
    async save() {
      if (disposed || saving) return;
      saving = true;
      onState({ status: 'saving' });
      try {
        await saveScore(result);
        if (!disposed) onState({ status: 'saved' });
      } catch (error) {
        if (!disposed) {
          onState({
            status: 'error',
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      } finally {
        saving = false;
      }
    },
    dispose() {
      disposed = true;
    },
  };
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   result: { score: number, wave: number, durationSeconds: number },
 *   saveScore?: (result: object) => Promise<void>,
 *   bestScoreStore?: { submit(score: number): { best: number | null, isNewBest: boolean } },
 * }} params
 * @param {{ show(name: string, params?: object): void }} nav
 * @returns {() => void}
 */
export function mountResults(container, { result, saveScore, bestScoreStore }, nav) {
  const screen = document.createElement('section');
  screen.className = 'app-screen results-screen screen-enter';
  screen.setAttribute('aria-labelledby', 'results-title');
  screen.innerHTML = `
    <div class="results-screen__panel">
      <p class="results-screen__signal">Señal de la nave perdida</p>
      <h1 id="results-title">GAME OVER</h1>
      <p class="results-screen__score" aria-label="Puntaje">
        <span data-result-score></span>
        <span class="results-screen__score-label">PUNTAJE</span>
      </p>
      <p class="results-screen__new-best" data-new-best hidden>¡Nuevo récord!</p>
      <dl class="results-screen__details">
        <div><dt>Oleada</dt><dd data-result-wave></dd></div>
        <div><dt>Tiempo de misión</dt><dd data-result-duration></dd></div>
      </dl>
      <div class="results-screen__save" data-save-area hidden>
        <p role="status" aria-live="polite" data-save-status></p>
        <button class="main-menu__button" type="button" data-action="retry" hidden>
          Reintentar
        </button>
      </div>
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
  if (result.mode === 'solo' && bestScoreStore) {
    const { isNewBest } = bestScoreStore.submit(result.score);
    screen.querySelector('[data-new-best]').hidden = !isNewBest;
  }
  screen.querySelector('[data-action="replay"]').addEventListener('click', () => nav.show('playing'));
  screen.querySelector('[data-action="home"]').addEventListener('click', () => nav.show('home'));

  const saveArea = screen.querySelector('[data-save-area]');
  const saveStatus = screen.querySelector('[data-save-status]');
  const retryButton = screen.querySelector('[data-action="retry"]');
  let saveController;
  if (typeof saveScore === 'function') {
    saveArea.hidden = false;
    saveController = createScoreSaveController({
      saveScore,
      result,
      onState: ({ status, error }) => {
        if (status === 'saving') {
          saveStatus.textContent = 'Guardando puntaje…';
          saveStatus.removeAttribute('title');
          retryButton.hidden = true;
          retryButton.disabled = true;
        } else if (status === 'saved') {
          saveStatus.textContent = 'Puntaje guardado en el ranking';
          saveStatus.removeAttribute('title');
        } else {
          saveStatus.textContent = 'No se pudo guardar el puntaje';
          saveStatus.title = error.message;
          retryButton.hidden = false;
          retryButton.disabled = false;
        }
      },
    });
    retryButton.addEventListener('click', () => { void saveController.save(); });
    void saveController.save();
  }

  container.append(screen);
  screen.querySelector('[data-action="replay"]').focus();

  return () => {
    saveController?.dispose();
    screen.remove();
  };
}
