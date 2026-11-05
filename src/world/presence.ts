/**
 * いま遊んでいる人数（要件 F50）の数え方。サーバー（worker/）が使う。DOM・three.js・astronomy-engine を読み込まない。
 *
 * 宇宙の部屋（恒星系ごと。worker/space-room.ts）が、中の接続の数を D1 の presence 表に書く。
 * 書くのは、つながったとき・切れたとき・届いたメッセージのうち前に書いてから PRESENCE_REFRESH_MS たったもの（タイマーは使わない）。
 * 数えるのは、PRESENCE_STALE_MS より新しい行の合計。部屋が閉じたことを知らせずに消えても、その行は自然に数えなくなる。
 * 数えるのは接続なので、同じ人が 2 つのタブで遊ぶと 2 人になる。
 */
/** 部屋が数を書き直す間隔（ms） */
export const PRESENCE_REFRESH_MS = 60_000;
/** この時間より古い行は数えない（ms）。書き直す間隔の 2 倍より少し長く */
export const PRESENCE_STALE_MS = 150_000;
/** 返す人数の上限（桁あふれと、悪用された値で表示が崩れるのを避ける） */
export const PRESENCE_MAX = 9_999_999;

/** 部屋が書く文。数が 0 なら行を消し、1 以上なら書き直す */
export function presenceStatement(room: string, count: number, now: number): { sql: string; params: (string | number)[] } {
  if (count <= 0) return { sql: 'DELETE FROM presence WHERE room = ?', params: [room] };
  return {
    sql: `INSERT INTO presence (room, count, at) VALUES (?, ?, ?)
          ON CONFLICT (room) DO UPDATE SET count = excluded.count, at = excluded.at`,
    params: [room, Math.floor(count), now],
  };
}

/** 数える文。引数は「この時刻より新しい行だけ」の下限 */
export function onlineCountStatement(now: number): { sql: string; params: number[] } {
  return { sql: 'SELECT COALESCE(SUM(count), 0) AS online FROM presence WHERE at > ?', params: [now - PRESENCE_STALE_MS] };
}

export const clampOnline = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(PRESENCE_MAX, Math.floor(n))) : 0);
