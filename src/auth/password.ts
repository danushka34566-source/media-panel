import crypto from 'crypto';

export const hashPassword = (password: string) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
};

export const passwordMatches = (password: string, storedHash: string) => {
  if (storedHash.startsWith('scrypt$')) {
    const [, salt, expectedHex] = storedHash.split('$');
    if (!salt || !expectedHex) { return false; }
    const actual = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    return actual.length === expected.length &&
      crypto.timingSafeEqual(actual, expected);
  }

  const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
  const actual = Buffer.from(legacyHash, 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected);
};
