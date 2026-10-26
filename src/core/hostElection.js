// Relevo del rol de host cuando el host se desconecta.
// Ver `.spec/multiplayer_sync.md` §5.

/** Tiempo que el host debe seguir desconectado antes de que otro jugador lo releve. */
export const HOST_TAKEOVER_GRACE_MS = 2000;

/**
 * ¿Debo asumir el rol de host? Sí si el host actual figura desconectado y yo soy, entre los
 * jugadores conectados que quedan, el de menor `uid` (así dos candidatos nunca se pisan).
 *
 * @param {{
 *   players: Record<string, { connected?: boolean }>,
 *   hostUid: string | null,
 *   myUid: string,
 *   status?: string | null,
 * }} state
 * @returns {boolean}
 */
export function shouldTakeOverHost({ players, hostUid, myUid, status = null }) {
  if (!hostUid || hostUid === myUid || status === 'finished') return false;
  if (players[hostUid]?.connected !== false) return false;
  if (players[myUid]?.connected !== true) return false;
  const candidates = Object.entries(players)
    .filter(([uid, player]) => uid !== hostUid && player?.connected === true)
    .map(([uid]) => uid)
    .sort();
  return candidates[0] === myUid;
}
