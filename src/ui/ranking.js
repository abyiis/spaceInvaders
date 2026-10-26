/**
 * Mount the top-score screen.
 *
 * @param {HTMLElement} container
 * @param {{
 *   loadScores: () => Promise<Array<{ id: string, name?: string, score?: number, wave?: number, mode?: string }>>,
 *   onBack: () => void,
 * }} options
 * @returns {() => void}
 */
export function mountRanking(container, { loadScores, onBack }) {
  const screen = document.createElement('section');
  screen.className = 'main-menu ranking-screen screen-enter';
  screen.setAttribute('aria-labelledby', 'ranking-title');
  screen.innerHTML = `
    <div class="main-menu__panel ranking-screen__panel">
      <p class="main-menu__eyebrow">Mejores pilotos</p>
      <h1 id="ranking-title">Ranking</h1>
      <p class="main-menu__message" role="status" aria-live="polite">Cargando ranking…</p>
      <ol class="ranking-screen__list"></ol>
      <button class="main-menu__button" type="button" data-action="retry" hidden>
        Reintentar
      </button>
      <button class="main-menu__button" type="button" data-action="back">
        Volver al inicio
      </button>
    </div>
  `;

  const message = screen.querySelector('.main-menu__message');
  const list = screen.querySelector('.ranking-screen__list');
  const retryButton = screen.querySelector('[data-action="retry"]');
  let disposed = false;
  let loading = false;

  const refresh = async () => {
    if (loading || disposed) return;
    loading = true;
    retryButton.hidden = true;
    message.textContent = 'Cargando ranking…';
    list.replaceChildren();
    try {
      const scores = await loadScores();
      if (disposed) return;
      if (scores.length === 0) {
        message.textContent = 'Aún no hay puntajes guardados.';
        return;
      }

      const formatter = new Intl.NumberFormat('es-CO');
      for (const [index, entry] of scores.entries()) {
        const item = document.createElement('li');
        const rank = document.createElement('span');
        const player = document.createElement('span');
        const score = document.createElement('span');
        rank.textContent = `${index + 1}.`;
        player.textContent = entry.mode === 'coop'
          ? `${entry.name || 'Equipo'} · coop`
          : entry.name || 'Jugador';
        score.textContent = `${formatter.format(Number(entry.score) || 0)} pts`;
        item.append(rank, player, score);
        list.append(item);
      }
      message.textContent = `Puntajes: ${scores.length}`;
    } catch (error) {
      if (disposed) return;
      const detail = error instanceof Error ? error.message : String(error);
      message.textContent = `No se pudo cargar el ranking: ${detail}`;
      retryButton.hidden = false;
    } finally {
      loading = false;
    }
  };

  screen.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'retry') void refresh();
    if (button.dataset.action === 'back') {
      disposed = true;
      screen.remove();
      onBack();
    }
  });

  container.append(screen);
  screen.querySelector('[data-action="back"]').focus();
  void refresh();

  return () => {
    disposed = true;
    screen.remove();
  };
}
