import { describe, expect, it } from 'vitest';
import { canonicalBlocks, decodeBlocks, encodeBlocks, GRID, isValidBlocks, MAX_BLOCKS, MAX_BLOCKS_TEXT, PALETTE, type Block } from './ship-blocks';

const b = (x: number, y: number, z: number, s: 0 | 1 | 2 = 1, c = 0): Block => ({ x, y, z, s, c });

describe('ブロックの船の形', () => {
  it('文字列にして戻すと、同じブロックになる（並びは決まった順）', () => {
    const blocks = [b(10, 20, 30, 2, 5), b(0, 0, 0, 0, PALETTE.length - 1), b(GRID - 2, GRID - 2, GRID - 2, 1, 3)];
    const text = encodeBlocks(blocks);
    const back = decodeBlocks(text);
    expect(back).not.toBeNull();
    expect(new Set(back!.map((v) => JSON.stringify(v)))).toEqual(new Set(blocks.map((v) => JSON.stringify(v))));
    // 並べる順が違っても、同じ文字列
    expect(encodeBlocks([...blocks].reverse())).toBe(text);
    expect(canonicalBlocks(text)).toBe(text);
  });

  it('1〜3 ブロックの長さ（base64 の = の数が違う）でも戻せる', () => {
    for (const n of [1, 2, 3]) {
      const blocks = Array.from({ length: n }, (_, i) => b(i * 2, 0, 0));
      expect(decodeBlocks(encodeBlocks(blocks))?.length).toBe(n);
    }
  });

  it('範囲の外・重なり・知らない色・大きさは正しくない', () => {
    expect(isValidBlocks([b(GRID - 1, 0, 0, 1)])).toBe(false); // 1 m のブロックが範囲をはみ出す
    expect(isValidBlocks([b(GRID - 1, 0, 0, 0)])).toBe(true); // 0.5 m なら入る
    expect(isValidBlocks([b(0, 0, 0, 2), b(2, 2, 2, 0)])).toBe(false); // ダブルの中にハーフ
    expect(isValidBlocks([b(0, 0, 0, 2), b(4, 0, 0, 2)])).toBe(true); // くっついているだけ
    expect(isValidBlocks([b(0, 0, 0, 1, PALETTE.length)])).toBe(false);
    expect(isValidBlocks([{ x: 0, y: 0, z: 0, s: 3 as 0, c: 0 }])).toBe(false);
    expect(isValidBlocks([])).toBe(false);
  });

  it('壊れた文字列・大きすぎる文字列は読まない', () => {
    expect(decodeBlocks('')).toBeNull();
    expect(decodeBlocks('abc')).toBeNull();
    expect(decodeBlocks('####')).toBeNull();
    expect(decodeBlocks(123)).toBeNull();
    expect(decodeBlocks('A'.repeat(MAX_BLOCKS_TEXT + 4))).toBeNull();
    // 同じブロックが 2 つ（重なり）
    expect(decodeBlocks(encodeBlocks([b(0, 0, 0), b(0, 0, 0)]))).toBeNull();
  });

  it('上限の数までは読める', () => {
    const blocks: Block[] = [];
    for (let i = 0; blocks.length < MAX_BLOCKS; i++) blocks.push(b(i % GRID, Math.floor(i / GRID) % GRID, Math.floor(i / GRID / GRID), 0));
    const text = encodeBlocks(blocks);
    expect(text.length).toBeLessThanOrEqual(MAX_BLOCKS_TEXT);
    expect(decodeBlocks(text)?.length).toBe(MAX_BLOCKS);
    expect(decodeBlocks(encodeBlocks([...blocks, b(0, 0, 79, 0)]))).toBeNull();
  });
});
