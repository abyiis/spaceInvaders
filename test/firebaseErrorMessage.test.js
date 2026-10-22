import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatFirebaseError } from '../src/ui/firebaseErrorMessage.js';

test('adds Firebase setup guidance to permission-denied errors', () => {
  assert.match(
    formatFirebaseError({ code: 'PERMISSION_DENIED', message: 'permission_denied' }),
    /autenticación anónima.*reglas de seguridad estén desplegadas.*permission_denied/,
  );
  assert.match(
    formatFirebaseError(new Error('permission_denied')),
    /Firebase rechazó la operación/,
  );
});

test('preserves actionable details for other Firebase failures', () => {
  assert.equal(
    formatFirebaseError(new Error('Firestore API has not been used before.')),
    'Firestore API has not been used before.',
  );
});
