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
/** スタンプが浮かんで消える時間（ms） */
export const STAMP_SHOW_MS = 2_400;
/** もらったスタンプが UFO のまわりでふわふわ漂って消える時間（ms） */
export const GIFT_STAMP_SHOW_MS = 3_800;
/** 画面の左下の履歴に残す数 */
export const CHAT_LOG_SIZE = 30;
/** 相手から離れたとみなしてチャットの絞り込みを解除する最小距離（km） */
export const CHAT_FOCUS_LEAVE_MIN_KM = 10;
/** クリックしたときの距離の何倍を超えたら「離れた」とみなすか */
export const CHAT_FOCUS_LEAVE_MULTIPLIER = 3;
/** UFO に照準を合わせたときに出すスタンプの輪の最小半径（CSS ピクセル） */
export const SHIP_STAMP_RING_MIN_PX = 68;
/** UFO の画面上の半径に足す余白（CSS ピクセル） */
export const SHIP_STAMP_RING_PAD_PX = 34;
/** スタンプの輪の 1 個あたりの当たり半径（CSS ピクセル） */
export const SHIP_STAMP_HIT_PX = 24;
/** UFO に照準を合わせたときに輪を開く余裕（CSS ピクセル） */
export const SHIP_STAMP_AIM_ENTER_PAD_PX = 16;
/** スタンプへ照準を動かしても輪を開いたまま保つ外側の余裕（CSS ピクセル） */
export const SHIP_STAMP_KEEP_PAD_PX = 56;

const ONE_EMOJI = /\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic}\uFE0F?)*/gu;

/** 絵文字 1〜2 個だけのチャットか（UFO の上で枠なしのリアクションとして浮かせる） */
export function isStampText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  const emojis = trimmed.match(ONE_EMOJI);
  if (!emojis || emojis.length === 0 || emojis.length > 2) return false;
  return trimmed.replace(ONE_EMOJI, '').trim().length === 0;
}

export interface ChatFilterTarget {
  id: string;
  since: number;
}

export interface ChatFilterEntry {
  from: string;
  mine: boolean;
  at: number;
  to?: string | null;
}

/** 相手の UFO をクリックしている間は、クリック以降のその相手との会話（相手の発言・自分の返信・相手とのスタンプ）だけを返す */
export function filterChatLog<T extends ChatFilterEntry>(log: readonly T[], focus: ChatFilterTarget | null): T[] {
  if (!focus) return [...log];
  return log.filter((l) => l.at >= focus.since && (l.to ? l.from === focus.id || l.to === focus.id : l.from === focus.id || l.mine));
}

export interface StampRingSlot {
  stamp: string;
  x: number;
  y: number;
  angle: number;
}

/** UFO の画面上の半径と画面の短辺から、まわりのスタンプの輪の半径（px）を決める */
export function stampRingRadiusPx(shipRadiusPx: number, viewportMinPx: number): number {
  const maxR = Math.max(SHIP_STAMP_RING_MIN_PX, viewportMinPx * 0.34);
  return Math.min(maxR, Math.max(SHIP_STAMP_RING_MIN_PX, shipRadiusPx + SHIP_STAMP_RING_PAD_PX));
}

/** UFO の中心 (cx, cy) のまわりにスタンプを時計回りに並べる（最初は真上） */
export function stampRingSlots(cx: number, cy: number, radiusPx: number, stamps: readonly string[] = CHAT_STAMPS): StampRingSlot[] {
  return stamps.map((stamp, i) => {
    const angle = -Math.PI / 2 + (i / stamps.length) * Math.PI * 2;
    return { stamp, x: cx + Math.cos(angle) * radiusPx, y: cy + Math.sin(angle) * radiusPx, angle };
  });
}

/** (px, py) にいちばん近いスタンプの番号を返す（hitRadiusPx より遠ければ -1） */
export function pickStampSlot(px: number, py: number, slots: readonly StampRingSlot[], hitRadiusPx = SHIP_STAMP_HIT_PX): number {
  let best = -1;
  let bestD = hitRadiusPx;
  for (let i = 0; i < slots.length; i++) {
    const d = Math.hypot(slots[i].x - px, slots[i].y - py);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** クリック時の距離に応じた「離れた」とみなす距離（km） */
export function leaveChatFocusDistanceKm(clickedDistanceKm: number): number {
  return Math.max(CHAT_FOCUS_LEAVE_MIN_KM, clickedDistanceKm * CHAT_FOCUS_LEAVE_MULTIPLIER);
}

/** 絞り込み中の相手がいなくなった、または十分に離れたら true */
export function shouldLeaveChatFocus(distanceKm: number | null, clickedDistanceKm: number): boolean {
  return distanceKm === null || distanceKm > leaveChatFocusDistanceKm(clickedDistanceKm);
}

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
