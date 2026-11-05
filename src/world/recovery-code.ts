/**
 * 回復コード（要件 F51）。ユーザー名やパスワードを忘れたときに戻すためのコード。メールを集めないので、これが復旧の手段になる。
 * サーバー（worker/recovery.ts）とブラウザの両方で使う。DOM・three.js・astronomy-engine を読み込まない。
 *
 * - 20 文字（Crockford の base32。1 文字 5 ビットで 100 ビット）。推測できない長さなので、ハッシュは SHA-256 で足りる（遅いハッシュは要らない）
 * - 見間違えやすい文字は使わない。O・I・L を打っても 0・1 として読む。大文字小文字・空白・ハイフンは問わない
 * - コード自体はサーバーに保存しない（ハッシュだけ）。見せるのは作ったときの 1 回だけ
 *
 * SQL の組み立ても純粋な関数にして、本物のテーブルでテストする（recovery-code.test.ts）。D1 に流すのは worker/recovery.ts
 */
export const RECOVERY_CODE_LENGTH = 20;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const GROUP = 5;

/** 新しいコード（ハイフンで区切った見せる形） */
export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_CODE_LENGTH));
  // 文字は 32 種類で 256 の約数なので、31 との AND で偏らない
  return formatRecoveryCode(Array.from(bytes, (b) => ALPHABET[b & 31]).join(''));
}

/** 20 文字を 5 文字ずつ区切る */
export function formatRecoveryCode(normalized: string): string {
  const parts: string[] = [];
  for (let i = 0; i < normalized.length; i += GROUP) parts.push(normalized.slice(i, i + GROUP));
  return parts.join('-');
}

/** 入力をそろえる。コードの形でなければ null */
export function normalizeRecoveryCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > RECOVERY_CODE_LENGTH * 3) return null;
  const s = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (s.length !== RECOVERY_CODE_LENGTH) return null;
  for (const ch of s) if (!ALPHABET.includes(ch)) return null;
  return s;
}

/** そろえたコードの SHA-256（16 進） */
export async function hashRecoveryCode(normalized: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface SqlStatement {
  sql: string;
  params: (string | number)[];
}

/** コードを作る・作り直す（前のコードは使えなくなる） */
export function saveCodeStatement(userId: string, codeHash: string, nowIso: string): SqlStatement {
  return {
    sql: `INSERT INTO recovery_codes (user_id, code_hash, created_at) VALUES (?, ?, ?)
          ON CONFLICT (user_id) DO UPDATE SET code_hash = excluded.code_hash, created_at = excluded.created_at`,
    params: [userId, codeHash, nowIso],
  };
}

/** コードから、持ち主とユーザー名を引く */
export function findByCodeStatement(codeHash: string): SqlStatement {
  return {
    sql: `SELECT r.user_id AS userId, COALESCE(u.displayUsername, u.username, u.name) AS username
          FROM recovery_codes r JOIN "user" u ON u.id = r.user_id WHERE r.code_hash = ?`,
    params: [codeHash],
  };
}

/**
 * パスワードを決め直す文。1 つの batch（まとめて成功か失敗）で、順番どおりに流す。
 * どの文も「古いコードがまだ有効なこと」を条件にするので、同じコードで同時に送られても、1 回しか効かない。
 * ほかの端末のログインをすべて切る（誰かに使われていたときのため）。古いコードは新しいコードに置き換わる。
 * 最後の文で 1 行変わらなければ、コードはもう使えなかったということ
 */
export function resetPasswordStatements(userId: string, oldCodeHash: string, newCodeHash: string, passwordHash: string, nowIso: string): SqlStatement[] {
  const stillValid = 'EXISTS (SELECT 1 FROM recovery_codes WHERE user_id = ? AND code_hash = ?)';
  return [
    {
      sql: `UPDATE account SET password = ?, updatedAt = ? WHERE userId = ? AND providerId = 'credential' AND ${stillValid}`,
      params: [passwordHash, nowIso, userId, userId, oldCodeHash],
    },
    { sql: `DELETE FROM session WHERE userId = ? AND ${stillValid}`, params: [userId, userId, oldCodeHash] },
    {
      sql: 'UPDATE recovery_codes SET code_hash = ?, created_at = ? WHERE user_id = ? AND code_hash = ?',
      params: [newCodeHash, nowIso, userId, oldCodeHash],
    },
  ];
}
