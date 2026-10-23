import { attachInput } from '../../game/input.js';
import { createPauseController } from '../pauseController.js';

/**
 * @param {HTMLElement} container
 * @param {{
 *   game: import('../../game/Game.js').Game,
 *   canvas: HTMLCanvasElement,
 *   onPauseReady?: (open: (() => boolean) | null) => void,
 * }} params
 * @param {{ show(name: string): void }} nav
 * @returns {() => void}
 */
export function mountPlaying(container, { game, canvas, onPauseReady }, nav) {
  game.startNewGame();
  let detachInput = attachInput(canvas, game);

  const pauseButton = document.createElement('button');
  pauseButton.className = 'pause-button';
  pauseButton.type = 'button';
  pauseButton.setAttribute('aria-label', 'Pausar');
  pauseButton.textContent = '⏸';
  pauseButton.dataset.action = 'pause';
  const pauseMenu = document.createElement('section');
  pauseMenu.className = 'app-screen pause-menu screen-enter';
  pauseMenu.setAttribute('aria-labelledby', 'pause-title');
  pauseMenu.innerHTML = `
    <div class="pause-menu__panel">
      <p class="pause-menu__icon" aria-hidden="true">Ⅱ</p>
      <h1 id="pause-title">PAUSA</h1>
      <p class="pause-menu__description">La galaxia puede esperar.</p>
      <button class="main-menu__button main-menu__button--primary" type="button" data-action="resume">
        Reanudar Partida
      </button>
      <button class="main-menu__button" type="button" data-action="exit">
        Abandonar Partida
      </button>
    </div>
  `;

  let controller;
  const onPauseMenuClick = (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('[data-action]');
    if (button?.dataset.action === 'resume') controller.resume();
    if (button?.dataset.action === 'exit') controller.exit();
  };
  pauseMenu.addEventListener('click', onPauseMenuClick);
  controller = createPauseController({
    game,
    attachInput: () => {
      detachInput = attachInput(canvas, game);
      return detachInput;
    },
    detachInput: () => {
      detachInput?.();
      detachInput = null;
    },
    onOpen: () => {
      container.append(pauseMenu);
      pauseMenu.querySelector('[data-action="resume"]').focus();
    },
    onClose: () => pauseMenu.remove(),
    onExit: () => nav.show('home'),
  });
  onPauseReady?.(controller.open);
  pauseButton.addEventListener('click', controller.open);

  if (!game.sync.isCoop) container.append(pauseButton);
  return () => {
    pauseButton.removeEventListener('click', controller.open);
    pauseMenu.removeEventListener('click', onPauseMenuClick);
    controller.destroy();
    onPauseReady?.(null);
    pauseButton.remove();
    pauseMenu.remove();
    game.pause();
  };
}
