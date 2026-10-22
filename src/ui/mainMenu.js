/**
 * Mounts the main menu into the application UI layer.
 *
 * @param {HTMLElement} container
 * @param {{
 *   onPlaySolo: () => void,
 *   onCreateRoom: () => Promise<void>,
 *   onJoinRoom: (code: string) => Promise<void>,
 *   onShowRanking?: () => Promise<void>,
 * }} actions
 */
export function mountMainMenu(container, actions) {
  const menu = document.createElement('section');
  menu.className = 'main-menu';
  menu.setAttribute('aria-labelledby', 'main-menu-title');
  menu.innerHTML = `
    <div class="main-menu__panel">
      <p class="main-menu__eyebrow">Arcade cooperativo</p>
      <h1 id="main-menu-title">Space Coop</h1>
      <p class="main-menu__description">Defiende la galaxia. ¿Listo para jugar?</p>
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
  const runAsyncAction = async (action, button) => {
    if (typeof action !== 'function') {
      message.textContent = 'Esta opción todavía no está disponible.';
      return;
    }
    button.disabled = true;
    message.textContent = 'Conectando con Firebase…';
    try {
      await action();
      menu.remove();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
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
        menu.remove();
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
      default:
        break;
    }
  });

  joinForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const button = joinForm.querySelector('[type="submit"]');
    void runAsyncAction(() => actions.onJoinRoom(joinInput.value), button);
  });

  container.append(menu);
}
