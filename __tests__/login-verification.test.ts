import {
  getLoginVerificationNonceState,
  getVerifiedLoginNonce,
} from '../src/auth/login-verification';

it('distinguishes a pending challenge from an explicitly completed one', () => {
  const nonce = 'session-a';
  expect(getLoginVerificationNonceState(nonce, nonce)).toBe('pending');
  expect(getLoginVerificationNonceState(
    nonce,
    getVerifiedLoginNonce(nonce),
  )).toBe('verified');
});

it('rejects a superseded challenge without signing in the old session', () => {
  expect(getLoginVerificationNonceState('old-session', 'new-session'))
    .toBe('superseded');
  expect(getLoginVerificationNonceState('old-session', undefined))
    .toBe('superseded');
  expect(getLoginVerificationNonceState(undefined, 'new-session'))
    .toBe('none');
});
