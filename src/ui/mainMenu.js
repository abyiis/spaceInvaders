import { formatScore } from './screens/results.js';
import { formatFirebaseError } from './firebaseErrorMessage.js';

/**
 * Mounts the main menu into the application UI layer.
 *
 * @param {HTMLElement} container
 * @param {{
 *   onPlaySolo: () => void,
 *   onCreateRoom: () => Promise<void>,
 *   onJoinRoom: (code: string) => Promise<void>,
 *   onShowRanking?: () => Promise<void>,
 *   onShowCredits?: () => void,
 *   onLoadAlias?: () => Promise<string>,
 *   onSaveAlias?: (name: string) => Promise<string>,
 *   bestScore?: number | null,
 * }} actions
 * @returns {() => void}
 */
export function mountMainMenu(container, actions) {
  const menu = document.createElement('section');
  menu.className = 'main-menu screen-enter';
  menu.setAttribute('aria-labelledby', 'main-menu-title');
  menu.innerHTML = `
    <div class="main-menu__panel">
      <p class="main-menu__eyebrow">Arcade cooperativo</p>
      <h1 id="main-menu-title">Space Coop</h1>
      <p class="main-menu__description">Defiende la galaxia. ¿Listo para jugar?</p>
      <p class="main-menu__best-score" data-best-score hidden></p>
      <details class="main-menu__alias" hidden>
        <summary>Alias: <span data-current-alias>Jugador</span></summary>
        <form class="main-menu__alias-form">
          <label for="player-alias">Tu alias (máximo 16 caracteres)</label>
          <input id="player-alias" name="alias" maxlength="16" minlength="1" required />
          <button class="main-menu__button" type="submit">Guardar alias</button>
        </form>
      </details>
      <div class="main-menu__actions">
        <button class="main-menu__button main-menu__button--primary" type="button" data-action="solo">
          Jugar solo
        </button>
        <button class="main-menu__button" type="button" data-action="create">
          Crear sala
        </button>
        <button class="main-menu__button" type="button" data-action="join-open">
          Unirse a sala
        </button>
        <button class="main-menu__button" type="button" data-action="ranking">
          Ranking
        </button>
        <button class="main-menu__button main-menu__button--secondary" type="button" data-action="credits">
          Créditos
        </button>
      </div>
      <form class="main-menu__join-form" hidden>
        <label for="room-code">Código de sala</label>
        <input id="room-code" name="code" autocomplete="off" maxlength="5" required
          aria-describedby="room-code-hint" />
        <p id="room-code-hint">Introduce el código de cinco caracteres que te compartieron.</p>
        <button class="main-menu__button main-menu__button--primary" type="submit">
          Entrar a sala
        </button>
      </form>
      <p class="main-menu__message" role="status" aria-live="polite"></p>
    </div>
  `;

  const message = menu.querySelector('.main-menu__message');
  const joinForm = menu.querySelector('.main-menu__join-form');
  const joinInput = menu.querySelector('#room-code');
  const aliasDetails = menu.querySelector('.main-menu__alias');
  const aliasForm = menu.querySelector('.main-menu__alias-form');
  const aliasInput = menu.querySelector('#player-alias');
  const currentAlias = menu.querySelector('[data-current-alias]');
  const bestScoreLine = menu.querySelector('[data-best-score]');
  if (Number.isSafeInteger(actions.bestScore) && actions.bestScore >= 0) {
    bestScoreLine.textContent = `Tu récord: ${formatScore(actions.bestScore)}`;
    bestScoreLine.hidden = false;
  }
  const runAsyncAction = async (action, button) => {
    if (typeof action !== 'function') {
      message.textContent = 'Esta opción todavía no está disponible.';
      return;
    }
    button.disabled = true;
    message.textContent = 'Conectando con Firebase…';
    try {
      await action();
    } catch (error) {
      const detail = formatFirebaseError(error);
      message.textContent = `No se pudo completar la acción: ${detail}`;
    } finally {
      button.disabled = false;
    }
  };

  menu.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('[data-action]');
    if (!button) return;

    switch (button.dataset.action) {
      case 'solo':
        actions.onPlaySolo();
        break;
      case 'create':
        void runAsyncAction(actions.onCreateRoom, button);
        break;
      case 'join-open':
        joinForm.hidden = false;
        joinInput.focus();
        break;
      case 'ranking':
        void runAsyncAction(actions.onShowRanking, button);
        break;
      case 'credits':
        actions.onShowCredits?.();
        break;
      default:
        break;
    }
  });

  joinForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const button = joinForm.querySelector('[type="submit"]');
    void runAsyncAction(() => actions.onJoinRoom(joinInput.value), button);
  });

  if (typeof actions.onLoadAlias === 'function' && typeof actions.onSaveAlias === 'function') {
    aliasDetails.hidden = false;
    void actions.onLoadAlias()
      .then((name) => {
        aliasInput.value = name;
        currentAlias.textContent = name;
      })
      .catch((error) => {
        const detail = formatFirebaseError(error);
        message.textContent = `No se pudo cargar tu alias: ${detail}`;
      });

    aliasForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const button = aliasForm.querySelector('[type="submit"]');
      void runAsyncAction(async () => {
        const name = await actions.onSaveAlias(aliasInput.value);
        aliasInput.value = name;
        currentAlias.textContent = name;
        message.textContent = 'Alias guardado.';
      }, button);
    });
  }

  container.append(menu);
  menu.querySelector('[data-action="solo"]').focus();
  return () => menu.remove();
}
