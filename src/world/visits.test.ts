import { describe, expect, it } from 'vitest';
import { isVisit, isVisitInput } from './visits';

describe('コレクションの記録の確かめ', () => {
  it('正しい記録を通す', () => {
    expect(isVisitInput({ key: 'S6.6', kind: 'moon', name: 'タイタン' })).toBe(true);
    expect(isVisitInput({ key: 'C:Melotte 22', kind: 'cluster', name: 'プレアデス星団' })).toBe(true);
    expect(isVisitInput({ key: 'H70666.1.2~3', kind: 'exoplanet', name: '第1惑星の第2衛星' })).toBe(true);
    expect(isVisit({ key: 'Earth', kind: 'planet', name: '地球', firstAt: '2026-11-05T00:00:00.000Z' })).toBe(true);
  });

  it('知らない種類・長すぎる名前・使えない文字を通さない', () => {
    expect(isVisitInput({ key: 'Earth', kind: 'quasar', name: '地球' })).toBe(false);
    expect(isVisitInput({ key: 'Earth', kind: 'planet', name: 'あ'.repeat(81) })).toBe(false);
    expect(isVisitInput({ key: 'Earth', kind: 'planet', name: '' })).toBe(false);
    expect(isVisitInput({ key: '<script>', kind: 'planet', name: 'x' })).toBe(false);
    expect(isVisitInput({ key: 'x'.repeat(65), kind: 'planet', name: 'x' })).toBe(false);
    expect(isVisitInput(null)).toBe(false);
    expect(isVisit({ key: 'Earth', kind: 'planet', name: '地球' })).toBe(false);
  });
});
