/**
 * チャット（要件 F6。2026-11-12 にスタンプから置き換えた）。近くのプレイヤーへの短い文。
 * サーバー（worker/）とブラウザの両方で使う。three.js・DOM・astronomy-engine を読み込まない。決まりは docs/tech/chat.md。
 */

/** 1 回に送れる長さ（文字。絵文字の組み合わせは、いくつかの文字に数える） */
export const CHAT_MAX_CHARS = 80;
/** 1 人が続けて送れる間隔（ms）。サーバーも同じ値で確かめ、これより速いものは捨てる */
export const CHAT_MIN_INTERVAL_MS = 1_000;
/** 船の上の吹き出しを出しておく長さ（ms） */
export const CHAT_SHOW_MS = 6_000;
/** 画面の左下の履歴に残す数 */
export const CHAT_LOG_SIZE = 30;

/**
 * スタンプ（2026-11-12 にオーナーの指示で、チャットの入力欄の上に常に並べる）。押すと、その絵文字をチャットとして送る。
 * 絵文字は、スタンプだけだったころ（2026-11-05 にオーナーが決めた 8 種）と同じ。決まったあいさつ（文字）は同じ日に外した。
 * サーバーから見るとふつうのチャットの文なので、確かめ方も cleanChatText と同じ
 */
export const CHAT_STAMPS = ['👋', '👍', '❤️', '😂', '🎉', '😮', '🙏', '👀'] as const;

/**
 * 受け取った文を、配ってよい形にする。だめなら null。サーバーは必ずこれで確かめる。
 * - 制御文字（改行・タブを含む）と、文字の向きを変える記号（なりすましの表示に使われる）は、空白にするか消す
 * - 空白は 1 つにまとめ、前後の空白を消す。空になったら送らない
 * - CHAT_MAX_CHARS を超えるものは、切らずに捨てる（ブラウザの入力欄も同じ長さで止める）
 */
export function cleanChatText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const text = v
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[؜‎‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length === 0 || [...text].length > CHAT_MAX_CHARS) return null;
  return text;
}
