import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;

export const getTotpIssuerFromDomain = (
  domain: string | undefined,
  fallback = 'Media Panel',
) => {
  const value = domain?.trim();
  if (!value) { return fallback; }
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    return url.hostname || fallback;
  } catch {
    return fallback;
  }
};

export const generateTotpSecret = (bytes = 20) => {
  const buffer = crypto.randomBytes(bytes);
  let bits = '';
  let output = '';
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
    while (bits.length >= 5) {
      output += BASE32_ALPHABET[parseInt(bits.slice(0, 5), 2)];
      bits = bits.slice(5);
    }
  }
  if (bits.length > 0) {
    output += BASE32_ALPHABET[parseInt(bits.padEnd(5, '0'), 2)];
  }
  return output;
};

const decodeBase32 = (secret: string) => {
  const clean = secret.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = '';
  const bytes: number[] = [];
  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) { throw new Error('Invalid authenticator secret'); }
    bits += value.toString(2).padStart(5, '0');
    while (bits.length >= 8) {
      bytes.push(parseInt(bits.slice(0, 8), 2));
      bits = bits.slice(8);
    }
  }
  return Buffer.from(bytes);
};

export const getTotpCounter = (time = Date.now()) =>
  Math.floor(time / 1000 / TOTP_STEP_SECONDS);

const generateTotpCodeForCounter = (
  secret: string,
  counter: number,
  digits = 6,
) => {
  const key = decodeBase32(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 10 ** digits).toString().padStart(digits, '0');
};

export const verifyTotpCodeWithCounter = (
  secret: string,
  code: string,
  windowSteps = 1,
) => {
  const normalized = code.replace(/\D/g, '');
  if (normalized.length !== 6) {
    return { valid: false, counter: null as number | null };
  }
  const currentCounter = getTotpCounter();
  for (let offset = -windowSteps; offset <= windowSteps; offset++) {
    const counter = currentCounter + offset;
    const expected = generateTotpCodeForCounter(secret, counter);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))) {
      return { valid: true, counter };
    }
  }
  return { valid: false, counter: null as number | null };
};

export const buildTotpUri = ({
  issuer,
  account,
  secret,
}: {
  issuer: string
  account: string
  secret: string
}) => {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?${params.toString()}`;
};
