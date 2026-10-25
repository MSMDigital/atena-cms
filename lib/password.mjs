// Password: scrypt (incluso in Node, nessuna dipendenza nativa) con sale casuale. Formato: scrypt$N$r$p$sale$hash (base64).
import crypto from 'node:crypto';

const N = 32768, R = 8, P = 1, KEYLEN = 64, MAXMEM = 64 * 1024 * 1024;
const scrypt = (pw, salt, n, r, p, len) => new Promise((res, rej) => crypto.scrypt(pw, salt, len, { N: n, r, p, maxmem: MAXMEM }, (e, k) => (e ? rej(e) : res(k))));

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, N, R, P, KEYLEN);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, n, r, p, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64'), +n, +r, +p, expected.length);
  return crypto.timingSafeEqual(key, expected);
}

export { MIN_PASSWORD, passwordProblem } from './password-policy.mjs';
import { passwordProblem } from './password-policy.mjs';
export const generatePassword = () => crypto.randomBytes(18).toString('base64url');

// Una password casuale che rispetta la politica (mostrata una sola volta).
export function strongPassword(who = {}) {
  for (;;) { const p = generatePassword(); if (!passwordProblem(p, who)) return p; }
}
