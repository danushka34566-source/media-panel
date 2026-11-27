const VERIFIED_NONCE_PREFIX = 'verified:';

export class VerificationCodeCooldownError extends Error {
  constructor() {
    super('Please wait a minute before requesting another verification code.');
  }
}

export type LoginVerificationNonceState =
  | 'none'
  | 'pending'
  | 'verified'
  | 'superseded';

export const getLoginVerificationNonceState = (
  sessionNonce?: string,
  storedNonce?: string,
): LoginVerificationNonceState => {
  if (!sessionNonce) { return 'none'; }
  if (storedNonce === sessionNonce) { return 'pending'; }
  if (storedNonce === `${VERIFIED_NONCE_PREFIX}${sessionNonce}`) {
    return 'verified';
  }
  return 'superseded';
};

export const getVerifiedLoginNonce = (nonce: string) =>
  `${VERIFIED_NONCE_PREFIX}${nonce}`;
