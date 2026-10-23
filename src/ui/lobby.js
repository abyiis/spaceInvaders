/**
 * Mount the live room lobby and return a cleanup function.
 *
 * @param {HTMLElement} container
 * @param {{
 *   code: string,
 *   uid: string,
 *   hostUid?: string,
 *   isHost?: boolean,
 *   watchPlayers: (code: string, onPlayers: (players: Record<string, object>) => void, onError: (error: Error) => void) => () => void,
 *   watchRoomStatus: (code: string, onStatus: (meta: object | null) => void, onError: (error: Error) => void) => () => void,
 *   watchPresence: (code: string, uid: string, onError: (error: Error) => void) => () => Promise<void>,
 *   setReady: (code: string, ready: boolean) => Promise<void>,
 *   startGame: (code: string) => Promise<object>,
 *   onStart: (meta: object) => void,
 *   onBack: () => void,
 * }} options
 * @returns {() => void}
 */
export function mountLobby(container, {
  code,
  uid,
  hostUid,
  isHost = uid === hostUid,
  watchPlayers,
  watchRoomStatus,
  watchPresence,
  setReady,
  startGame,
  onStart,
  onBack,
}) {
  const lobby = document.createElement('section');
  lobby.className = 'main-menu room-lobby screen-enter';
  lobby.setAttribute('aria-labelledby', 'room-lobby-title');
  lobby.innerHTML = `
    <div class="main-menu__panel room-lobby__panel">
      <p class="main-menu__eyebrow">Sala cooperativa</p>
      <h1 id="room-lobby-title">Código: <span class="room-lobby__code"></span></h1>
      <p class="main-menu__description">Comparte el código y espera a tu compañero.</p>
      <ul class="room-lobby__players" aria-label="Jugadores conectados"></ul>
      <button class="main-menu__button main-menu__button--primary" type="button" data-action="ready">
        Listo
      </button>
      <button class="main-menu__button main-menu__button--primary" type="button" data-action="start" hidden disabled>
        Iniciar partida
      </button>
      <button class="main-menu__button" type="button" data-action="back">
        Volver al inicio
      </button>
      <p class="main-menu__message" role="status" aria-live="polite">Cargando jugadores…</p>
    </div>
  `;

  const codeLabel = lobby.querySelector('.room-lobby__code');
  const playersList = lobby.querySelector('.room-lobby__players');
  const readyButton = lobby.querySelector('[data-action="ready"]');
  const startButton = lobby.querySelector('[data-action="start"]');
  const backButton = lobby.querySelector('[data-action="back"]');
  const message = lobby.querySelector('.main-menu__message');
  codeLabel.textContent = code;

  let ready = false;
  let disposed = false;
  let savingReady = false;
  let starting = false;
  let startHandled = false;
  startButton.hidden = !isHost;

  const renderPlayers = (players) => {
    if (disposed) return;
    playersList.replaceChildren();
    for (const [playerUid, player] of Object.entries(players)) {
      const item = document.createElement('li');
      const name = document.createElement('span');
      const state = document.createElement('span');
      const isCurrentPlayer = playerUid === uid;
      name.textContent = `${player.name || 'Jugador'}${isCurrentPlayer ? ' (tú)' : ''}`;
      state.textContent = player.ready ? 'Listo' : 'Esperando';
      item.append(name, state);
      playersList.append(item);
      if (isCurrentPlayer) {
        ready = player.ready === true;
        readyButton.textContent = ready ? 'Quitar listo' : 'Listo';
      }
    }

    const othersReady = Object.entries(players)
      .filter(([playerUid]) => playerUid !== uid)
      .every(([, player]) => player.ready === true);
    const allReady = Object.keys(players).length === 2
      && Object.values(players).every((player) => player.ready === true && player.connected === true);
    startButton.disabled = !isHost || !allReady || starting;
    message.textContent = Object.keys(players).length < 2
      ? 'Esperando a otro jugador…'
      : ready && othersReady
        ? isHost
          ? 'Todos están listos. Inicia la partida cuando quieras.'
          : 'Todos están listos. Esperando que el host inicie la partida.'
        : 'Marca «Listo» cuando estés preparado.';
  };

  const unsubscribe = watchPlayers(
    code,
    renderPlayers,
    (error) => {
      if (!disposed) {
        message.textContent = `No se pudo actualizar la sala: ${error.message}`;
      }
    },
  );
  const unsubscribeStatus = watchRoomStatus(code, (meta) => {
    if (disposed || startHandled || meta?.status !== 'playing') return;
    startHandled = true;
    onStart(meta);
  }, (error) => {
    if (!disposed) message.textContent = `No se pudo actualizar la sala: ${error.message}`;
  });
  const stopPresence = watchPresence(code, uid, (error) => {
    if (!disposed) {
      message.textContent = `No se pudo actualizar la presencia: ${error.message}`;
    }
  });

  lobby.addEventListener('click', async (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('[data-action]');
    if (!button) return;

    if (button.dataset.action === 'back') {
      backButton.disabled = true;
      message.textContent = 'Saliendo de la sala…';
      try {
        await cleanup();
        onBack();
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        message.textContent = `No se pudo cerrar la presencia de la sala: ${detail}`;
        backButton.disabled = false;
      }
      return;
    }
    if (button.dataset.action === 'start') {
      if (!isHost || startButton.disabled || starting) return;
      starting = true;
      startButton.disabled = true;
      message.textContent = 'Iniciando partida…';
      try {
        await startGame(code);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        message.textContent = `No se pudo iniciar la partida: ${detail}`;
        starting = false;
        startButton.disabled = false;
      }
      return;
    }
    if (button.dataset.action !== 'ready' || savingReady) return;

    savingReady = true;
    readyButton.disabled = true;
    message.textContent = 'Actualizando estado…';
    try {
      await setReady(code, !ready);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      message.textContent = `No se pudo cambiar el estado: ${detail}`;
    } finally {
      savingReady = false;
      readyButton.disabled = false;
    }
  });

  container.append(lobby);
  readyButton.focus();

  async function cleanup() {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    unsubscribeStatus();
    try {
      await stopPresence();
      lobby.remove();
    } catch (error) {
      disposed = false;
      throw error;
    }
  }

  return cleanup;
}
