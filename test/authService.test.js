import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthService } from '../src/net/authService.js';

test('signIn authenticates anonymously and returns the Firebase uid', async () => {
  const user = { uid: 'anonymous-user' };
  const auth = { currentUser: null };
  let receivedAuth;
  const service = createAuthService(auth, async (passedAuth) => {
    receivedAuth = passedAuth;
    auth.currentUser = user;
    return { user };
  });

  assert.equal(service.uid, null);
  assert.equal(await service.signIn(), 'anonymous-user');
  assert.equal(receivedAuth, auth);
  assert.equal(service.uid, 'anonymous-user');
});

test('signIn reuses the existing authenticated user', async () => {
  const auth = { currentUser: { uid: 'existing-user' } };
  const service = createAuthService(auth, async () => {
    assert.fail('sign-in should not run when a user is already authenticated');
  });

  assert.equal(await service.signIn(), 'existing-user');
});

test('signIn reports a missing uid and propagates Firebase errors', async () => {
  const auth = { currentUser: null };
  const missingUidService = createAuthService(auth, async () => ({ user: {} }));
  await assert.rejects(
    missingUidService.signIn(),
    /did not return an authenticated user/,
  );

  const firebaseError = new Error('Firebase unavailable');
  const failingService = createAuthService(auth, async () => {
    throw firebaseError;
  });
  await assert.rejects(failingService.signIn(), (error) => error === firebaseError);
});
