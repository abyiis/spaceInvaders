import { attachInput } from '../../game/input.js';
import { createLeaveController } from '../leaveController.js';
import { createPauseController } from '../pauseController.js';

/**
 * @param {HTMLElement} container
 * @param {{
 *   game: import('../../game/Game.js').Game,
 *   canvas: HTMLCanvasElement,
 *   onPauseReady?: (open: (() => boolean) | null) => void,
 *   onLeaveCoop?: () => Promise<void> | void,
 * }} params
 *   `onPauseReady` recibe la función que abre el menú de «Atrás»: la pausa en solo y el diálogo
 *   de salida en coop. `onLeaveCoop` abandona la sala antes de volver al Home.
 * @param {{ show(name: string): void }} nav
 * @returns {() => void}
 */
export function mountPlaying(container, { game, canvas, onPauseReady, onLeaveCoop }, nav) {
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
  pauseButton.addEventListener('click', controller.open);

  // En coop no hay pausa: el botón ✕ abre la confirmación «¿Salir de la partida?».
  const leaveDialog = document.createElement('section');
  leaveDialog.className = 'app-screen pause-menu screen-enter';
  leaveDialog.setAttribute('role', 'alertdialog');
  leaveDialog.setAttribute('aria-modal', 'true');
  leaveDialog.setAttribute('aria-labelledby', 'leave-title');
  leaveDialog.innerHTML = `
    <div class="pause-menu__panel">
      <h1 id="leave-title">¿Salir de la partida?</h1>
      <p class="pause-menu__description">Tu compañero seguirá jugando sin ti.</p>
      <button class="main-menu__button main-menu__button--primary" type="button" data-action="stay">
        Seguir jugando
      </button>
      <button class="main-menu__button" type="button" data-action="leave">
        Salir
      </button>
    </div>
  `;
  const leaveController = createLeaveController({
    game,
    onOpen: () => {
      container.append(leaveDialog);
      leaveDialog.querySelector('[data-action="stay"]').focus();
    },
    onClose: () => leaveDialog.remove(),
    onLeave: async () => {
      await onLeaveCoop?.();
      nav.show('home');
    },
  });
  const onLeaveDialogClick = (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('[data-action]');
    if (button?.dataset.action === 'stay') leaveController.stay();
    if (button?.dataset.action === 'leave') void leaveController.leave();
  };
  leaveDialog.addEventListener('click', onLeaveDialogClick);
  const leaveButton = document.createElement('button');
  leaveButton.className = 'pause-button';
  leaveButton.type = 'button';
  leaveButton.setAttribute('aria-label', 'Salir');
  leaveButton.textContent = '✕';
  leaveButton.dataset.action = 'leave-match';
  leaveButton.addEventListener('click', leaveController.open);

  if (game.sync.isCoop) {
    onPauseReady?.(leaveController.toggle);
    container.append(leaveButton);
  } else {
    onPauseReady?.(controller.open);
    container.append(pauseButton);
  }
  return () => {
    pauseButton.removeEventListener('click', controller.open);
    pauseMenu.removeEventListener('click', onPauseMenuClick);
    leaveButton.removeEventListener('click', leaveController.open);
    leaveDialog.removeEventListener('click', onLeaveDialogClick);
    controller.destroy();
    leaveController.destroy();
    onPauseReady?.(null);
    pauseButton.remove();
    leaveButton.remove();
    pauseMenu.remove();
    leaveDialog.remove();
    game.pause();
  };
}
