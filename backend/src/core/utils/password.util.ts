import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const KEYLEN = 64;
const SCRYPT_COST = 16384; // 2^14
const SALT_BYTES = 16;

/**
 * Hash a plaintext password with a per-password random salt using scrypt.
 * Output format: scrypt$<cost>$<saltHex>$<hashHex>
 */
export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(plain, salt, KEYLEN, { N: SCRYPT_COST });
  return `scrypt$${SCRYPT_COST}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * Verify a plaintext password against a stored hash. Constant-time comparison.
 * Returns false for any malformed stored value rather than throwing.
 */
export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;

  const cost = Number(parts[1]);
  if (!Number.isInteger(cost) || cost <= 0) return false;

  const salt = Buffer.from(parts[2], 'hex');
  const expected = Buffer.from(parts[3], 'hex');
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = scryptSync(plain, salt, expected.length, { N: cost });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
