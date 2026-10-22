import { CREDITS } from '../creditsData.js';

const TECHNOLOGIES = ['HTML5 Canvas', 'JavaScript', 'Vite', 'Capacitor', 'Firebase'];

/**
 * @param {HTMLElement} container
 * @param {object} _params
 * @param {{ show(name: string): void }} nav
 * @returns {() => void}
 */
export function mountCredits(container, _params, nav) {
  const section = document.createElement('section');
  section.className = 'app-screen credits-screen screen-enter';
  section.setAttribute('aria-labelledby', 'credits-title');
  section.innerHTML = `
    <div class="credits-screen__panel">
      <div class="credits-screen__content">
        <p class="main-menu__eyebrow">El equipo detrás del juego</p>
        <h1 id="credits-title">Créditos</h1>
        <h2>Equipo</h2>
        <ul class="credits-screen__team"></ul>
        <h2>Tecnologías</h2>
        <ul class="credits-screen__technologies"></ul>
        <p class="credits-screen__note">
          Sonidos y gráficos generados por código, sin recursos externos.
        </p>
      </div>
      <footer class="credits-screen__footer">
        <button class="main-menu__button" type="button" data-action="back">Volver</button>
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
  backButton.addEventListener('click', () => nav.show('home'));
  container.append(section);
  backButton.focus();

  return () => section.remove();
}
