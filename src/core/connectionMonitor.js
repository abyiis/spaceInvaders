// Estado de la conexión del cooperativo: propia y del compañero.
// Ver `.spec/multiplayer_sync.md` §5.

/** Sin cambios del compañero durante este tiempo se avisa de "conexión inestable". */
export const PEER_STALE_AFTER_MS = 5000;
/** Un compañero desconectado que no vuelve en este tiempo deja de formar parte de la partida. */
export const PEER_GONE_AFTER_MS = 10000;

/**
 * @typedef {Object} ConnectionStatus
 * @property {'ok' | 'unstable' | 'peer-offline' | 'peer-gone'} kind
 * @property {string} message Texto para el jugador (vacío si todo está bien).
 * @property {number} [secondsLeft] Solo `peer-offline`: segundos hasta darlo por fuera.
 */

/**
 * @param {{ now?: () => number, staleAfterMs?: number, goneAfterMs?: number }} [options]
 */
export function createConnectionMonitor({
  now = Date.now,
  staleAfterMs = PEER_STALE_AFTER_MS,
  goneAfterMs = PEER_GONE_AFTER_MS,
} = {}) {
  let localOnline = true;
  let peerConnected = null;
  let peerOfflineSince = null;
  let lastPeerSignalAt = now();

  return {
    /** `.info/connected` del propio cliente. */
    setLocalOnline(online) {
      localOnline = online !== false;
      // Al recuperar la red se espera una señal nueva antes de volver a juzgar al compañero.
      if (localOnline) lastPeerSignalAt = now();
    },

    /** Estado `connected` del compañero (`undefined`/`null` si todavía no figura). */
    setPeerConnected(connected) {
      if (connected === false) {
        if (peerOfflineSince === null) peerOfflineSince = now();
      } else {
        peerOfflineSince = null;
        if (connected === true) lastPeerSignalAt = now();
      }
      peerConnected = typeof connected === 'boolean' ? connected : null;
    },

    /** Llega una posición o latido nuevo del compañero. */
    notePeerSignal() {
      lastPeerSignalAt = now();
    },

    /** @returns {ConnectionStatus} */
    status() {
      const time = now();
      if (!localOnline) return { kind: 'unstable', message: 'Conexión inestable' };
      if (peerConnected === false && peerOfflineSince !== null) {
        const offlineMs = time - peerOfflineSince;
        if (offlineMs >= goneAfterMs) {
          return { kind: 'peer-gone', message: 'Tu compañero salió de la partida' };
        }
        const secondsLeft = Math.ceil((goneAfterMs - offlineMs) / 1000);
        return {
          kind: 'peer-offline',
          secondsLeft,
          message: `Compañero desconectado · se retira en ${secondsLeft} s`,
        };
      }
      if (peerConnected === true && time - lastPeerSignalAt > staleAfterMs) {
        return { kind: 'unstable', message: 'Conexión inestable' };
      }
      return { kind: 'ok', message: '' };
    },
  };
}
