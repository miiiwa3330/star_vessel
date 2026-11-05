import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  findByCodeStatement,
  formatRecoveryCode,
  generateRecoveryCode,
  hashRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_CODE_LENGTH,
  resetPasswordStatements,
  saveCodeStatement,
} from './recovery-code';

function db(): DatabaseSync {
  const d = new DatabaseSync(':memory:');
  for (const f of ['0001_auth.sql', '0005_username.sql', '0007_recovery_codes.sql']) d.exec(readFileSync(new URL(`../../migrations/${f}`, import.meta.url), 'utf8'));
  d.exec(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt, username, displayUsername) VALUES
    ('u1', 'Pilot', 'pilot@x.invalid', 0, 'd', 'd', 'pilot', 'Pilot'), ('u2', 'other', 'other@x.invalid', 0, 'd', 'd', 'other', NULL)`);
  d.exec(`INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES
    ('a1', 'u1', 'credential', 'u1', 'old-pass', 'd', 'd'), ('a2', 'u2', 'credential', 'u2', 'other-pass', 'd', 'd')`);
  d.exec(`INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES
    ('s1', 'd', 't1', 'd', 'd', 'u1'), ('s2', 'd', 't2', 'd', 'd', 'u1'), ('s3', 'd', 't3', 'd', 'd', 'u2')`);
  return d;
}
const run = (d: DatabaseSync, s: { sql: string; params: (string | number)[] }) => d.prepare(s.sql).run(...s.params);

describe('回復コードの形', () => {
  it('作ったコードは 20 文字で、そろえると同じものに読める', () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
    const n = normalizeRecoveryCode(code);
    expect(n).toHaveLength(RECOVERY_CODE_LENGTH);
    expect(formatRecoveryCode(n as string)).toBe(code);
  });

  it('毎回違うコードになり、見間違えやすい文字（I・L・O・U）は出てこない', () => {
    const codes = new Set(Array.from({ length: 2000 }, generateRecoveryCode));
    expect(codes.size).toBe(2000);
    expect([...codes].join('')).not.toMatch(/[ILOU]/);
  });

  it('小文字・空白・ハイフン・見間違えやすい文字を許して読む', () => {
    const want = '01234ABCDE01234ABCDE';
    expect(normalizeRecoveryCode('01234-ABCDE-01234-ABCDE')).toBe(want);
    expect(normalizeRecoveryCode(' 01234 abcde 01234 abcde\n')).toBe(want);
    expect(normalizeRecoveryCode('O1234-ABCDE-oI234-abcde')).toBe(want);
    expect(normalizeRecoveryCode('OL234ABCDEO1234ABCDE')).toBe(want);
  });

  it('形が違う入力は null', () => {
    for (const bad of ['', 'ABC', '01234-ABCDE-01234', '01234ABCDE01234ABCDEF', '01234-ABCDE-01234-ABCD!', 'U1234ABCDE01234ABCDE', undefined, 12345, 'A'.repeat(1000)]) {
      expect(normalizeRecoveryCode(bad)).toBeNull();
    }
  });

  it('ハッシュは SHA-256 の 16 進で、同じコードは同じハッシュになる', async () => {
    const h = await hashRecoveryCode('01234ABCDE01234ABCDE');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashRecoveryCode('01234ABCDE01234ABCDE')).toBe(h);
    expect(await hashRecoveryCode('01234ABCDE01234ABCDF')).not.toBe(h);
  });
});

describe('回復コードの保存と、パスワードの決め直し', () => {
  it('作り直すと置き換わり、前のコードでは引けない', () => {
    const d = db();
    run(d, saveCodeStatement('u1', 'hash-1', '2026-11-06'));
    run(d, saveCodeStatement('u1', 'hash-2', '2026-11-07'));
    const find = (h: string) => {
      const s = findByCodeStatement(h);
      return d.prepare(s.sql).get(...s.params);
    };
    expect(find('hash-1')).toBeUndefined();
    expect(find('hash-2')).toEqual({ userId: 'u1', username: 'Pilot' });
    expect(d.prepare('SELECT COUNT(*) AS n FROM recovery_codes').get()).toEqual({ n: 1 });
  });

  it('表示用の名前が無ければ、ユーザー名を返す', () => {
    const d = db();
    run(d, saveCodeStatement('u2', 'hash-x', '2026-11-06'));
    const s = findByCodeStatement('hash-x');
    expect(d.prepare(s.sql).get(...s.params)).toEqual({ userId: 'u2', username: 'other' });
  });

  it('決め直すと、パスワードが変わり、その人のログインだけが切れ、コードが置き換わる', () => {
    const d = db();
    run(d, saveCodeStatement('u1', 'old', '2026-11-06'));
    const results = resetPasswordStatements('u1', 'old', 'new', 'new-pass', '2026-11-07').map((s) => run(d, s));
    expect(results.at(-1)?.changes).toBe(1);
    expect(d.prepare("SELECT password, updatedAt FROM account WHERE userId = 'u1'").get()).toEqual({ password: 'new-pass', updatedAt: '2026-11-07' });
    expect(d.prepare("SELECT password FROM account WHERE userId = 'u2'").get()).toEqual({ password: 'other-pass' });
    expect(d.prepare('SELECT id FROM session').all()).toEqual([{ id: 's3' }]);
    expect(d.prepare('SELECT code_hash, created_at FROM recovery_codes').all()).toEqual([{ code_hash: 'new', created_at: '2026-11-07' }]);
  });

  it('同じコードは 2 回効かない（同時に送られても、あとの方は何も変えない）', () => {
    const d = db();
    run(d, saveCodeStatement('u1', 'old', '2026-11-06'));
    for (const s of resetPasswordStatements('u1', 'old', 'new', 'first-pass', '2026-11-07')) run(d, s);
    d.exec(`INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES ('s4', 'd', 't4', 'd', 'd', 'u1')`);
    const results = resetPasswordStatements('u1', 'old', 'newer', 'second-pass', '2026-11-08').map((s) => run(d, s));
    expect(results.at(-1)?.changes).toBe(0);
    expect(d.prepare("SELECT password FROM account WHERE userId = 'u1'").get()).toEqual({ password: 'first-pass' });
    expect(d.prepare("SELECT COUNT(*) AS n FROM session WHERE id = 's4'").get()).toEqual({ n: 1 });
    expect(d.prepare('SELECT code_hash FROM recovery_codes').get()).toEqual({ code_hash: 'new' });
  });
});
