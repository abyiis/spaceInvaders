import { CREDITS } from '../creditsData.js';

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

  const backButton = section.querySelector('[data-action="back"]');
  backButton.addEventListener('click', () => {
    if (result) nav.show('results', { result });
    else nav.show('home');
  });
  container.append(section);
  backButton.focus();

  return () => section.remove();
}
