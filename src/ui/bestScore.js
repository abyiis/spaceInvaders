import { BEST_SCORE_STORAGE_KEY } from './uiConstants.js';

/**
 * @param {{ storage?: Storage }} [options]
 * @returns {{ get(): number | null, submit(score: number): { best: number | null, isNewBest: boolean } }}
 */
export function createBestScoreStore({ storage } = {}) {
  const readStorage = () => {
    if (storage !== undefined) return storage;
    try {
      return globalThis.localStorage;
    } catch {
      return null;
    }
  };

  const readBest = () => {
    const target = readStorage();
    if (!target) return { available: false, best: null };
    try {
      const stored = target.getItem(BEST_SCORE_STORAGE_KEY);
      if (stored === null) return { available: true, best: null };
      const value = Number(stored);
      return {
        available: true,
        best: Number.isSafeInteger(value) && value >= 0 ? value : null,
      };
    } catch {
      return { available: false, best: null };
    }
  };

  return {
    get() {
      return readBest().best;
    },
    submit(score) {
      if (!Number.isSafeInteger(score) || score < 0) {
        throw new TypeError('score must be a non-negative safe integer');
      }

      const current = readBest();
      if (!current.available) return { best: null, isNewBest: false };
      if (current.best !== null && score <= current.best) {
        return { best: current.best, isNewBest: false };
      }

      const target = readStorage();
      if (!target) return { best: null, isNewBest: false };
      try {
        target.setItem(BEST_SCORE_STORAGE_KEY, String(score));
        return { best: score, isNewBest: true };
      } catch {
        return { best: current.best, isNewBest: false };
      }
    },
  };
}
