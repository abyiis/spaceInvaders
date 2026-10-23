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
      <header class="main-menu__header">
        <span class="main-menu__system-label"><span aria-hidden="true">▣</span> Sistema arcade / 01</span>
        <details class="main-menu__alias" hidden>
          <summary><span data-current-alias>Jugador</span><span aria-hidden="true">⌄</span></summary>
          <form class="main-menu__alias-form">
            <label for="player-alias">Tu alias (máximo 16 caracteres)</label>
            <input id="player-alias" name="alias" maxlength="16" minlength="1" required />
            <button class="main-menu__button" type="submit">Guardar alias</button>
          </form>
        </details>
      </header>
      <div class="main-menu__brand">
        <h1 id="main-menu-title"><span>NEON</span> INVADERS</h1>
        <p class="main-menu__tagline"><span>LA TIERRA ES TU ÚLTIMA LÍNEA</span></p>
      </div>
      <p class="main-menu__description">Bienvenido, piloto. Elige tu misión.</p>
      <div class="main-menu__missions">
        <section class="main-menu__mission main-menu__mission--solo" aria-labelledby="solo-title">
          <div>
            <h2 id="solo-title">Un Jugador</h2>
            <p>Tú contra la IA. Sobrevive a cada oleada.</p>
          </div>
          <button class="main-menu__button main-menu__button--primary" type="button" data-action="solo">
            Jugar
          </button>
        </section>
        <section class="main-menu__mission" aria-labelledby="create-room-title">
          <p class="main-menu__mission-label">Multijugador</p>
          <h2 id="create-room-title">Crear Sala</h2>
          <p>Comparte un código y defiende la Tierra junto a otro piloto.</p>
          <button class="main-menu__button" type="button" data-action="create">Crear Sala</button>
        </section>
        <section class="main-menu__mission" aria-labelledby="join-room-title">
          <p class="main-menu__mission-label">Multijugador</p>
          <h2 id="join-room-title">Unirse a Sala</h2>
          <form class="main-menu__join-form">
            <label for="room-code">Código de sala · 5 caracteres</label>
            <input id="room-code" name="code" autocomplete="off" maxlength="5" required
              aria-describedby="room-code-hint" placeholder="— — — — —" />
            <p id="room-code-hint">Introduce el código que te compartieron.</p>
            <button class="main-menu__button" type="submit">Unirse</button>
          </form>
        </section>
      </div>
      <div class="main-menu__utility-actions">
        <button class="main-menu__button main-menu__button--secondary" type="button" data-action="ranking">
          Ranking
        </button>
        <button class="main-menu__button main-menu__button--secondary" type="button" data-action="credits">
          Créditos
        </button>
      </div>
      <div class="main-menu__score-strip">
        <span>Récord personal</span>
        <p class="main-menu__best-score" data-best-score>Aún no hay récord</p>
        <span class="main-menu__score-strip-note">Modo individual / cooperativo</span>
      </div>
      <p class="main-menu__message" role="status" aria-live="polite"></p>
      <footer class="main-menu__footer">
        <span>© NEON INVADERS</span>
        <span>Una galaxia. Un piloto.</span>
      </footer>
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
  menu.querySelector('[data-action="solo"]').focus({ preventScroll: true });
  return () => menu.remove();
}
