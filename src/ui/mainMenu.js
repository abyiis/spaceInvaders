/**
 * Mounts the main menu into the application UI layer.
 *
 * @param {HTMLElement} container
 * @param {() => void} onPlaySolo
 */
export function mountMainMenu(container, onPlaySolo) {
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
        <button class="main-menu__button" type="button" data-action="join">
          Unirse a sala
        </button>
        <button class="main-menu__button" type="button" data-action="ranking">
          Ranking
        </button>
      </div>
      <p class="main-menu__message" role="status" aria-live="polite"></p>
    </div>
  `;

  const message = menu.querySelector('.main-menu__message');
  menu.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('[data-action]');
    if (!button) return;

    switch (button.dataset.action) {
      case 'solo':
        onPlaySolo();
        menu.remove();
        break;
      case 'create':
      case 'join':
        message.textContent = 'El modo cooperativo estará disponible al completar el lobby.';
        break;
      case 'ranking':
        message.textContent = 'El ranking estará disponible al integrar Firestore.';
        break;
      default:
        break;
    }
  });

  container.append(menu);
}
