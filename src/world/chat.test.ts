import { describe, expect, it } from 'vitest';
import {
  CHAT_FOCUS_LEAVE_MIN_KM,
  CHAT_MAX_CHARS,
  CHAT_STAMPS,
  SHIP_STAMP_RING_MIN_PX,
  SHIP_STAMP_RING_PAD_PX,
  cleanChatText,
  filterChatLog,
  isStampText,
  pickStampSlot,
  shouldLeaveChatFocus,
  stampRingRadiusPx,
  stampRingSlots,
} from './chat';

describe('チャットの文', () => {
  it('ふつうの文は、そのまま', () => {
    expect(cleanChatText('こんにちは 👋')).toBe('こんにちは 👋');
    expect(cleanChatText('<b>hi</b>')).toBe('<b>hi</b>'); // 画面には文字として出す（HTML として読まない）
  });

  it('改行・制御文字は空白にし、空白をまとめ、前後を消す', () => {
    expect(cleanChatText('  a\n\tb   c \u0007')).toBe('a b c');
  });

  it('文字の向きを変える記号は消す', () => {
    expect(cleanChatText('abc‮def⁦')).toBe('abcdef');
  });

  it('空・文字でないもの・長すぎるものは送らない', () => {
    expect(cleanChatText('')).toBeNull();
    expect(cleanChatText(' \n ')).toBeNull();
    expect(cleanChatText(1)).toBeNull();
    expect(cleanChatText(null)).toBeNull();
    expect(cleanChatText('あ'.repeat(CHAT_MAX_CHARS))).toHaveLength(CHAT_MAX_CHARS);
    expect(cleanChatText('あ'.repeat(CHAT_MAX_CHARS + 1))).toBeNull();
  });

  it('絵文字は、UTF-16 の長さではなく文字の数で数える', () => {
    expect(cleanChatText('😀'.repeat(CHAT_MAX_CHARS))).not.toBeNull();
  });

  it('スタンプは、どれもそのまま送れる文', () => {
    for (const t of CHAT_STAMPS) expect(cleanChatText(t)).toBe(t);
  });
});

describe('スタンプ判定と会話の絞り込み', () => {
  it('絵文字 1〜2 個だけをスタンプとみなす', () => {
    for (const t of CHAT_STAMPS) expect(isStampText(t)).toBe(true);
    expect(isStampText('❤️')).toBe(true);
    expect(isStampText('🛰️')).toBe(true);
    expect(isStampText('👋 🚀')).toBe(true);
    expect(isStampText('👋👋👋')).toBe(false);
    expect(isStampText('OK')).toBe(false);
    expect(isStampText('あ')).toBe(false);
    expect(isStampText('こんにちは 👋')).toBe(false);
    expect(isStampText('')).toBe(false);
  });

  it('相手を選んでいる間は、選んだ時刻以降の相手と自分の発言だけを残す', () => {
    const log = [
      { from: 'b', mine: false, at: 500, text: 'after-b' },
      { from: 'self', mine: true, at: 450, text: 'after-me' },
      { from: 'c', mine: false, at: 420, text: 'other-c' },
      { from: 'b', mine: false, at: 300, text: 'before-b' },
    ];
    expect(filterChatLog(log, null)).toHaveLength(4);
    expect(filterChatLog(log, { id: 'b', since: 400 }).map((l) => l.text)).toEqual(['after-b', 'after-me']);
  });

  it('相手がいなくなるか十分離れたら絞り込みを解除する', () => {
    expect(shouldLeaveChatFocus(null, 1)).toBe(true);
    expect(shouldLeaveChatFocus(CHAT_FOCUS_LEAVE_MIN_KM, 0.1)).toBe(false);
    expect(shouldLeaveChatFocus(CHAT_FOCUS_LEAVE_MIN_KM + 0.1, 0.1)).toBe(true);
    expect(shouldLeaveChatFocus(300, 100)).toBe(false);
    expect(shouldLeaveChatFocus(301, 100)).toBe(true);
  });

  it('相手宛てスタンプ（to）の絞り込みでは、選んだ相手とのやりとりだけを残す', () => {
    const log = [
      { from: 'self', to: 'b', mine: true, at: 500, text: '❤️' },
      { from: 'b', to: 'self', mine: false, at: 480, text: '👋' },
      { from: 'self', to: 'c', mine: true, at: 460, text: '👍' },
      { from: 'c', to: 'self', mine: false, at: 440, text: '😂' },
    ];
    expect(filterChatLog(log, { id: 'b', since: 400 }).map((l) => l.text)).toEqual(['❤️', '👋']);
  });
});

describe('UFO 周囲のスタンプリング', () => {
  it('機体の大きさと画面サイズに合わせて半径を決める', () => {
    expect(stampRingRadiusPx(10, 800)).toBe(SHIP_STAMP_RING_MIN_PX);
    expect(stampRingRadiusPx(60, 800)).toBe(60 + SHIP_STAMP_RING_PAD_PX);
    expect(stampRingRadiusPx(400, 500)).toBe(170);
  });

  it('8 つのスタンプを上から時計回りに円周上へ並べ、近い位置で選べる', () => {
    const slots = stampRingSlots(500, 400, 100);
    expect(slots).toHaveLength(CHAT_STAMPS.length);
    expect(slots[0].x).toBeCloseTo(500, 6);
    expect(slots[0].y).toBeCloseTo(300, 6);
    for (const s of slots) expect(Math.hypot(s.x - 500, s.y - 400)).toBeCloseTo(100, 6);
    expect(pickStampSlot(500, 300, slots)).toBe(0);
    expect(pickStampSlot(518, 300, slots)).toBe(0);
    expect(pickStampSlot(500, 400, slots)).toBe(-1);
  });
});
