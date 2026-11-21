import { describe, expect, it, vi } from 'vitest';
import { constantTimeEqual, hashPasswordPbkdf2, PBKDF2_ITERATIONS, PBKDF2_PREFIX, verifyPasswordHash } from './password';

describe('パスワードの PBKDF2 ハッシュと検証', () => {
  it('作ったハッシュで正しいパスワードを検証し、誤ったパスワードを拒否する', async () => {
    const hash = await hashPasswordPbkdf2('secret-pass-123');
    const parts = hash.split(':');
    expect(parts[0]).toBe(PBKDF2_PREFIX);
    expect(parts[1]).toBe(String(PBKDF2_ITERATIONS));
    expect(parts[2]).toHaveLength(32);
    expect(parts[3]).toHaveLength(64);

    expect(await verifyPasswordHash(hash, 'secret-pass-123')).toBe(true);
    expect(await verifyPasswordHash(hash, 'wrong-pass-123')).toBe(false);
  });

  it('ソルトが毎回変わり、NFKC 正規化が一致する', async () => {
    const h1 = await hashPasswordPbkdf2('ＡＢＣ12345');
    const h2 = await hashPasswordPbkdf2('ＡＢＣ12345');
    expect(h1).not.toBe(h2);
    expect(await verifyPasswordHash(h1, 'ABC12345')).toBe(true);
  });

  it('壊れたハッシュや許容外の反復回数を拒否する', async () => {
    const valid = await hashPasswordPbkdf2('password-1');
    const [, , salt, key] = valid.split(':');
    expect(await verifyPasswordHash('', 'password-1')).toBe(false);
    expect(await verifyPasswordHash(`pbkdf2:100001:${salt}:${key}`, 'password-1')).toBe(false);
    expect(await verifyPasswordHash(`pbkdf2:0:${salt}:${key}`, 'password-1')).toBe(false);
    expect(await verifyPasswordHash(`pbkdf2:100000:abcd:${key}`, 'password-1')).toBe(false);
    expect(await verifyPasswordHash(`pbkdf2:100000:${salt}:abcd`, 'password-1')).toBe(false);
    expect(await verifyPasswordHash(`pbkdf2:100000:${salt}:${key}:extra`, 'password-1')).toBe(false);
  });

  it('旧形式の scrypt ハッシュは legacyVerify に委譲する', async () => {
    const legacy = vi.fn().mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('bad'));
    expect(await verifyPasswordHash('0123abcd:deadbeef', 'old-pass', legacy)).toBe(true);
    expect(legacy).toHaveBeenCalledWith({ hash: '0123abcd:deadbeef', password: 'old-pass' });
    expect(await verifyPasswordHash('0123abcd:deadbeef', 'old-pass', legacy)).toBe(false);
    expect(await verifyPasswordHash('0123abcd:deadbeef', 'old-pass')).toBe(false);
  });

  it('constantTimeEqual は長さと内容の一致のみ true', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))).toBe(false);
  });
});
