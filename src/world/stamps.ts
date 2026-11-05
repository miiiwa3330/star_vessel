/**
 * スタンプ（要件 F6）。近くのプレイヤーへの軽いあいさつ。自由な文字は送れない（決まった中から選ぶ）。
 * サーバー（worker/）とブラウザの両方で使う。three.js・DOM・astronomy-engine を読み込まない。決まりは docs/tech/stamps.md。
 */

/** 送れるスタンプ。絵文字 8 種と、決まったあいさつ 4 つ（2026-11-05 にオーナーが決めた） */
export const STAMPS = [
  { id: 'wave', text: '👋', kind: 'emoji' },
  { id: 'good', text: '👍', kind: 'emoji' },
  { id: 'heart', text: '❤️', kind: 'emoji' },
  { id: 'laugh', text: '😂', kind: 'emoji' },
  { id: 'party', text: '🎉', kind: 'emoji' },
  { id: 'wow', text: '😮', kind: 'emoji' },
  { id: 'pray', text: '🙏', kind: 'emoji' },
  { id: 'look', text: '👀', kind: 'emoji' },
  { id: 'hello', text: 'こんにちは', kind: 'phrase' },
  { id: 'thanks', text: 'ありがとう', kind: 'phrase' },
  { id: 'bye', text: 'またね', kind: 'phrase' },
  { id: 'follow', text: 'ついてきて', kind: 'phrase' },
] as const;

export type StampId = (typeof STAMPS)[number]['id'];

export const isStampId = (v: unknown): v is StampId => typeof v === 'string' && STAMPS.some((s) => s.id === v);
export const stampText = (id: StampId): string => STAMPS.find((s) => s.id === id)!.text;

/** 1 人が続けて送れる間隔（ms）。サーバーも同じ値で確かめ、これより速いものは捨てる */
export const STAMP_MIN_INTERVAL_MS = 2_000;
/** 吹き出しを出しておく長さ（ms） */
export const STAMP_SHOW_MS = 4_000;
/** 画面の隅の履歴に残す数 */
export const STAMP_LOG_SIZE = 5;
