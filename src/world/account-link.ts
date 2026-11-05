/**
 * 匿名のアカウントから登録（または既存のアカウントへログイン）したとき、匿名のときの記録を移す（要件 F14・F49）。
 * Better Auth は、そのあと匿名のアカウントを消す。消える前に、ワープホール・宇宙船の設計・訪れた天体を移す。
 *
 * - ワープホール：全部移す。登録したアカウントがすでに持っていて合計が 3 個を超えても、消さない
 *   （全員で共有しているものなので、持ち主のいない 3 個目以降のワープホールを作らないため。超えた分は、新しく置けなくなるだけ）
 * - 宇宙船の設計：登録したアカウントがすでに決めていれば、そちらを残す
 * - 訪れた天体：両方を合わせる。同じ天体は、初めて訪れた日時の早い方を残す
 *
 * SQL の組み立てだけの純粋な関数にして、テストする（src/world/account-link.test.ts）。D1 に流すのは worker/auth.ts。
 */
export interface SqlStatement {
  sql: string;
  params: (string | number)[];
}

/** anonymousId の記録を userId へ移す文を、順番どおりに返す。1 つの batch（まとめて成功か失敗）で流す */
export function linkStatements(anonymousId: string, userId: string): SqlStatement[] {
  return [
    { sql: 'UPDATE warps SET owner_id = ? WHERE owner_id = ?', params: [userId, anonymousId] },
    {
      sql: `INSERT INTO ship_designs (user_id, design, updated_at)
            SELECT ?, design, updated_at FROM ship_designs WHERE user_id = ?
            ON CONFLICT (user_id) DO NOTHING`,
      params: [userId, anonymousId],
    },
    { sql: 'DELETE FROM ship_designs WHERE user_id = ?', params: [anonymousId] },
    {
      sql: `INSERT INTO visits (user_id, key, kind, name, first_at)
            SELECT ?, key, kind, name, first_at FROM visits WHERE user_id = ?
            ON CONFLICT (user_id, key) DO UPDATE SET first_at = MIN(visits.first_at, excluded.first_at)`,
      params: [userId, anonymousId],
    },
    { sql: 'DELETE FROM visits WHERE user_id = ?', params: [anonymousId] },
  ];
}
