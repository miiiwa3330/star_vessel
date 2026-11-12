import { describe, expect, it } from 'vitest';
import { CHAT_MAX_CHARS, CHAT_STAMPS, cleanChatText } from './chat';

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
