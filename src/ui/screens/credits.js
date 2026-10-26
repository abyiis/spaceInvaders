import { DEBUG_TOGGLE_EVENT } from '../../debug/debugOverlay.js';
import { CREDITS } from '../creditsData.js';

/** Toques seguidos en el título (en menos de este tiempo) que activan el panel de depuración. */
const DEBUG_TAPS = 5;
const DEBUG_TAP_WINDOW_MS = 3000;

const TECHNOLOGIES = ['HTML5 Canvas', 'JavaScript', 'Vite', 'Capacitor', 'Firebase'];

/**
 * @param {HTMLElement} container
 * @param {object} _params
 * @param {{ show(name: string): void }} nav
 * @returns {() => void}
 */
export function mountCredits(container, { result }, nav) {
  const section = document.createElement('section');
  section.className = 'app-screen credits-screen screen-enter';
  section.setAttribute('aria-labelledby', 'credits-title');
  section.innerHTML = `
    <div class="credits-screen__panel">
      <div class="credits-screen__content">
        <p class="main-menu__eyebrow">NEON INVADERS / ARCHIVOS</p>
        <h1 id="credits-title">CRÉDITOS</h1>
        <p class="credits-screen__intro">Detrás de cada píxel, una misión compartida.</p>
        <h2>El equipo</h2>
        <ul class="credits-screen__team"></ul>
        <h2>Tecnología de la misión</h2>
        <ul class="credits-screen__technologies"></ul>
        <p class="credits-screen__note">
          Sonidos y gráficos generados por código, sin recursos externos.
        </p>
      </div>
      <footer class="credits-screen__footer">
        <button class="main-menu__button" type="button" data-action="back">
          ${result ? 'Continuar' : 'Volver al Menú'}
        </button>
      </footer>
    </div>
  `;

  const team = section.querySelector('.credits-screen__team');
  for (const member of CREDITS.team) {
    const item = document.createElement('li');
    item.textContent = member.name;
    team.append(item);
  }

  const technologies = section.querySelector('.credits-screen__technologies');
  for (const technology of TECHNOLOGIES) {
    const item = document.createElement('li');
    item.textContent = technology;
    technologies.append(item);
  }

  // Gesto oculto para medir FPS y tráfico en un teléfono sin tocar la URL (tareas 4.2 y 4.3).
  let taps = [];
  section.querySelector('#credits-title').addEventListener('click', () => {
    const now = Date.now();
    taps = [...taps.filter((tap) => now - tap < DEBUG_TAP_WINDOW_MS), now];
    if (taps.length >= DEBUG_TAPS) {
      taps = [];
      window.dispatchEvent(new Event(DEBUG_TOGGLE_EVENT));
    }
  });

  const backButton = section.querySelector('[data-action="back"]');
  backButton.addEventListener('click', () => {
    if (result) nav.show('results', { result });
    else nav.show('home');
  });
  container.append(section);
  backButton.focus();

  return () => section.remove();
}
