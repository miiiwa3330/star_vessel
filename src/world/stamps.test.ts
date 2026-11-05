import { describe, expect, it } from 'vitest';
import { isStampId, STAMPS, stampText } from './stamps';

describe('スタンプ', () => {
  it('絵文字 8 種と、決まったあいさつ 4 つ', () => {
    expect(STAMPS.filter((s) => s.kind === 'emoji')).toHaveLength(8);
    expect(STAMPS.filter((s) => s.kind === 'phrase').map((s) => s.text)).toEqual(['こんにちは', 'ありがとう', 'またね', 'ついてきて']);
  });

  it('決まった id だけを受け付ける（自由な文字は送れない）', () => {
    expect(isStampId('wave')).toBe(true);
    expect(stampText('wave')).toBe('👋');
    expect(isStampId('こんにちは')).toBe(false);
    expect(isStampId('<b>hi</b>')).toBe(false);
    expect(isStampId(1)).toBe(false);
  });
});
