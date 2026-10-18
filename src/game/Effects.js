/**
 * Puerto de sonido y vibración. `Game` avisa de lo que ocurre sin saber cómo se
 * reproduce; la implementación real vive en `src/effects.js` y en las pruebas se
 * usa `NoopEffects`. Ver `.spec/architecture.md` §3.3.
 *
 * @typedef {Object} Effects
 * @property {() => void} shot      La nave local disparó.
 * @property {() => void} kill      Un impacto local destruyó a un enemigo.
 * @property {() => void} hit       La nave local perdió una vida.
 * @property {() => void} gameOver  La partida terminó.
 * @property {() => void} unlock    Primer gesto del usuario: habilita el audio.
 */

/**
 * Implementación silenciosa: no reproduce nada.
 * @implements {Effects}
 */
export class NoopEffects {
  shot() {}

  kill() {}

  hit() {}

  gameOver() {}

  unlock() {}
}