// PRNG determinista para todo lo que debe coincidir entre clientes.
// Ver `.spec/multiplayer_sync.md` §3. Nunca usar `Math.random()` en lo sincronizado.

/**
 * Generador mulberry32: misma semilla, misma secuencia en cualquier motor de JS.
 * @param {number} seed Entero de 32 bits (se normaliza con `>>> 0`).
 * @returns {() => number} Función que devuelve números en [0, 1).
 */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deriva una semilla independiente a partir de la de la sala y una "sal"
 * (oleada, tipo de flujo…), de modo que cada flujo consuma su propia secuencia.
 * @param {number} seed
 * @param {number} salt
 * @returns {number} Entero sin signo de 32 bits.
 */
export function deriveSeed(seed, salt) {
  let value = (seed >>> 0) ^ Math.imul((salt | 0) + 0x9e3779b9, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return (value ^ (value >>> 16)) >>> 0;
}

/** Atajo: generador de un flujo concreto de la sala. */
export function streamFor(seed, salt) {
  return mulberry32(deriveSeed(seed, salt));
}
