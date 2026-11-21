/**
 * パスワードのハッシュと検証（Web Crypto PBKDF2-HMAC-SHA-256）。
 *
 * Cloudflare Workers 無料プランの CPU 時間上限（10 ms）に収まるよう、ネイティブの `crypto.subtle` で PBKDF2 を計算する
 * （Better Auth 既定の `scrypt` は N=16384, r=16 で約 33.5 MB のメモリと長い CPU 時間を消費するため）。
 * Workers 本番の Web Crypto 上限に合わせて反復回数は 100,000 回とし、既存の `scrypt` ハッシュが DB に残っていても
 * 検証時のみ `legacyVerify` にフォールバックして互換性を保つ。
 */

export const PBKDF2_PREFIX = 'pbkdf2';
/** Cloudflare Workers 本番の `crypto.subtle.deriveBits` 上限（100,000） */
export const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

function fromHex(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** タイミング差を抑えたバイト列比較 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function derivePbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, KEY_BYTES * 8);
  return new Uint8Array(bits);
}

/** `pbkdf2:100000:<saltHex>:<keyHex>` の形式でハッシュを作る */
export async function hashPasswordPbkdf2(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(SALT_BYTES)));
  const key = await derivePbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `${PBKDF2_PREFIX}:${PBKDF2_ITERATIONS}:${toHex(salt)}:${toHex(key)}`;
}

export type LegacyPasswordVerifier = (args: { hash: string; password: string }) => Promise<boolean>;

/** PBKDF2 形式のハッシュを検証する。旧形式（`scrypt`）は `legacyVerify` があればフォールバックする */
export async function verifyPasswordHash(hash: string, password: string, legacyVerify?: LegacyPasswordVerifier): Promise<boolean> {
  if (!hash) return false;
  if (!hash.startsWith(`${PBKDF2_PREFIX}:`)) {
    if (!legacyVerify) return false;
    try {
      return await legacyVerify({ hash, password });
    } catch {
      return false;
    }
  }
  const parts = hash.split(':');
  if (parts.length !== 4) return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS) return false;
  const saltRaw = fromHex(parts[2]);
  const expected = fromHex(parts[3]);
  if (!saltRaw || saltRaw.length !== SALT_BYTES || !expected || expected.length !== KEY_BYTES) return false;
  const salt = new Uint8Array(new ArrayBuffer(SALT_BYTES));
  salt.set(saltRaw);
  const actual = await derivePbkdf2(password, salt, iterations);
  return constantTimeEqual(actual, expected);
}
