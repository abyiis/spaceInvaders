/**
 * Sonido (Web Audio, sintetizado) y vibración del juego.
 * Implementa el puerto `Effects` de `src/game/Effects.js`. Ver `.spec/architecture.md` §3.3.
 *
 * Nada de lo que ocurre aquí puede interrumpir la partida: si no hay Web Audio o la
 * vibración no está disponible, el efecto simplemente se omite.
 */

const HIT_VIBRATION_MS = 150;

/**
 * @typedef {Object} HapticsPlugin
 * @property {(options: {duration: number}) => Promise<void> | void} vibrate
 */

/**
 * @param {{
 *   AudioContextClass?: typeof AudioContext,
 *   haptics?: HapticsPlugin,
 * }} [opts]
 *   Ambos se inyectan para poder probar sin navegador ni Capacitor.
 * @returns {import('./game/Effects.js').Effects}
 */
export function createEffects({
  AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext,
  haptics,
} = {}) {
  /** @type {AudioContext | null} */
  let audio = null;

  /** Ejecuta `fn` ignorando cualquier error: un efecto fallido no debe romper el juego. */
  const safely = (fn) => {
    try {
      fn();
    } catch {
      // Sin audio o sin vibración en este dispositivo.
    }
  };

  /**
   * Reproduce un tono que baja (o sube) de `from` a `to` Hz y se apaga solo.
   * @param {{type: OscillatorType, from: number, to: number, duration: number,
   *   volume: number, delay?: number}} tone
   */
  const playTone = ({ type, from, to, duration, volume, delay = 0 }) =>
    safely(() => {
      if (!audio || audio.state !== 'running') return;

      const start = audio.currentTime + delay;
      const osc = audio.createOscillator();
      const gain = audio.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(from, start);
      osc.frequency.exponentialRampToValueAtTime(to, start + duration);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(start);
      osc.stop(start + duration);
    });

  const vibrate = () =>
    safely(() => {
      // `vibrate` puede lanzar de forma síncrona o devolver una promesa rechazada.
      Promise.resolve(haptics?.vibrate({ duration: HIT_VIBRATION_MS })).catch(() => {});
    });

  return {
    shot() {
      playTone({ type: 'square', from: 880, to: 440, duration: 0.06, volume: 0.03 });
    },

    kill() {
      playTone({ type: 'triangle', from: 440, to: 110, duration: 0.12, volume: 0.1 });
    },

    hit() {
      playTone({ type: 'sawtooth', from: 180, to: 50, duration: 0.3, volume: 0.15 });
      vibrate();
    },

    gameOver() {
      const notes = [392, 330, 262];
      notes.forEach((freq, i) =>
        playTone({
          type: 'triangle',
          from: freq,
          to: freq * 0.9,
          duration: 0.25,
          volume: 0.12,
          delay: i * 0.22,
        }),
      );
    },

    unlock() {
      safely(() => {
        if (!AudioContextClass) return;
        audio ??= new AudioContextClass();
        // Un AudioContext nace suspendido hasta el primer gesto y puede volver a suspenderse
        // al pasar la app a segundo plano.
        if (audio.state !== 'running') audio.resume()?.catch?.(() => {});
      });
    },
  };
}