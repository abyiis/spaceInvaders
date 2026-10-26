// Libro de bajas del host: el primer reclamo gana y los duplicados se ignoran.
// Ver `.spec/multiplayer_sync.md` §4.3.

/**
 * @returns {{
 *   claimKill(wave: number, enemyId: number, uid: string, points?: number): boolean,
 *   claimBonusKill(wave: number, shipId: number, uid: string, points?: number): boolean,
 *   hasKill(wave: number, enemyId: number): boolean,
 *   markDrop(key: string): boolean,
 *   startWave(wave: number): void,
 *   killsBy(): Record<string, number>,
 *   pointsBy(): Record<string, number>,
 *   reset(): void,
 * }}
 */
export function createHostLedger() {
  /** @type {Set<string>} */
  let claimed = new Set();
  /** @type {Set<string>} */
  let drops = new Set();
  /** @type {Record<string, number>} */
  let kills = {};
  /** @type {Record<string, number>} */
  let points = {};

  const claim = (key, uid, awarded) => {
    if (claimed.has(key)) return false;
    claimed.add(key);
    kills[uid] = (kills[uid] ?? 0) + 1;
    points[uid] = (points[uid] ?? 0) + awarded;
    return true;
  };

  return {
    /** `true` si `uid` es el primero en reclamar ese enemigo de esa oleada. */
    claimKill(wave, enemyId, uid, awarded = 0) {
      return claim(`k:${wave}:${enemyId}`, uid, awarded);
    },

    /** Igual que `claimKill`, para las naves de la fase bonus. */
    claimBonusKill(wave, shipId, uid, awarded = 0) {
      return claim(`b:${wave}:${shipId}`, uid, awarded);
    },

    hasKill(wave, enemyId) {
      return claimed.has(`k:${wave}:${enemyId}`);
    },

    /** Marca que ya se creó el potenciador `key`. `false` si ya existía. */
    markDrop(key) {
      if (drops.has(key)) return false;
      drops.add(key);
      return true;
    },

    /** Olvida los reclamos de oleadas anteriores a `wave` (los totales por jugador se conservan). */
    startWave(wave) {
      const keep = (key) => {
        const keyWave = Number(key.split(':')[1]);
        return keyWave >= wave;
      };
      claimed = new Set([...claimed].filter(keep));
      drops = new Set([...drops].filter(keep));
    },

    killsBy() {
      return { ...kills };
    },

    pointsBy() {
      return { ...points };
    },

    reset() {
      claimed = new Set();
      drops = new Set();
      kills = {};
      points = {};
    },
  };
}
