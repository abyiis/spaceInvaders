/**
 * Bloquea la app en vertical: el lienzo lógico es 9:16 y una rotación rompería la escala del
 * juego. Ver `.spec/architecture.md` §3.6. Es código de enlace con Capacitor (como `lifecycle.js`).
 *
 * @param {{ lock(options: { orientation: string }): Promise<void> } | null | undefined} screenOrientation
 *   Plugin `@capacitor/screen-orientation`, inyectado para poder probarlo en Node.
 * @param {{ onError?: (error: Error) => void }} [options]
 * @returns {Promise<boolean>} `true` si el sistema aceptó el bloqueo.
 */
export async function lockPortrait(screenOrientation, { onError = () => {} } = {}) {
  if (typeof screenOrientation?.lock !== 'function') return false;
  try {
    await screenOrientation.lock({ orientation: 'portrait' });
    return true;
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}
