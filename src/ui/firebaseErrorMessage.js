/**
 * @param {unknown} error
 * @returns {string}
 */
export function formatFirebaseError(error) {
  const detail = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String(error.message)
      : String(error);
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code).toLowerCase().replaceAll('_', '-')
    : '';

  if (code === 'permission-denied' || /permission[_ -]denied/i.test(detail)) {
    return `Firebase rechazó la operación. Comprueba que la autenticación anónima esté habilitada y que las reglas de seguridad estén desplegadas. Detalle: ${detail}`;
  }

  return detail;
}
