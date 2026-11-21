import { describe, expect, it } from 'vitest';
import { encodeBlocks } from './ship-blocks';
import { defaultHullFor, HULL_TYPES, isShipDesign, lookOf, MAX_CUSTOM_SHIPS, parseShipDesign, parseShipLook, usedCustom } from './ship-design';
import { lookOrNone, isShipState } from './ship-schema';

const blocks = encodeBlocks([{ x: 0, y: 0, z: 0, s: 1, c: 0 }]);

describe('宇宙船の設計', () => {
  it('版 2：使う船と、作った船のブロックの一覧', () => {
    for (const hull of HULL_TYPES) expect(isShipDesign({ v: 2, use: hull })).toBe(true);
    expect(parseShipDesign({ v: 2, use: 1, customs: [blocks, blocks] })).toEqual({ v: 2, use: 1, customs: [blocks, blocks] });
    expect(parseShipDesign({ v: 2, use: 'bell', customs: [blocks] })).toEqual({ v: 2, use: 'bell', customs: [blocks] });
    expect(parseShipDesign({ v: 2, use: 'bell', customs: [] })).toEqual({ v: 2, use: 'bell' });
    expect(isShipDesign({ v: 2, use: 0 })).toBe(false); // 作った船を使うのに、ブロックが無い
    expect(isShipDesign({ v: 2, use: 2, customs: [blocks, blocks] })).toBe(false); // 番号が一覧の外
    expect(isShipDesign({ v: 2, use: 0.5, customs: [blocks] })).toBe(false);
    expect(isShipDesign({ v: 2, use: 0, customs: ['xx'] })).toBe(false);
    expect(isShipDesign({ v: 2, use: 'ring', customs: Array(MAX_CUSTOM_SHIPS + 1).fill(blocks) })).toBe(false);
    expect(isShipDesign({ v: 2, use: 'ufo' })).toBe(false);
    expect(isShipDesign({ v: 2, use: 'bell', extra: 1 })).toBe(false);
    expect(isShipDesign(null)).toBe(false);
    expect(isShipDesign([1])).toBe(false);
  });

  it('前の版（v: 1）も読める', () => {
    expect(parseShipDesign({ v: 1, hull: 'ring' })).toEqual({ v: 2, use: 'ring' });
    expect(parseShipDesign({ v: 1, hull: 'arrow' })).toBeNull(); // やめた船体
    expect(parseShipDesign({ v: 1, hull: 'ring', extra: 1 })).toBeNull();
  });

  it('決めていない人の船は id でいつも同じで、3 種類に散らばる', () => {
    expect(defaultHullFor('abc')).toBe(defaultHullFor('abc'));
    const hulls = new Set(Array.from({ length: 50 }, (_, i) => defaultHullFor(`user-${i}`)));
    expect(hulls.size).toBe(3);
  });

  it('宇宙の部屋で配る見た目の印', () => {
    const ref = '0123456789abcdef0123456789abcdef';
    expect(lookOf({ v: 2, use: 0, customs: [blocks] }, ref)).toEqual({ v: 2, ref });
    expect(lookOf({ v: 2, use: 0, customs: [blocks] }, null)).toEqual({ v: 2, hull: 'saucer' });
    expect(lookOf({ v: 2, use: 'bell', customs: [blocks] }, ref)).toEqual({ v: 2, hull: 'bell' });
    expect(usedCustom({ v: 2, use: 0, customs: [blocks] })).toBe(blocks);
    expect(usedCustom({ v: 2, use: 'bell', customs: [blocks] })).toBeNull();
    expect(lookOf(null, null)).toEqual({ v: 2, hull: 'saucer' });
    expect(parseShipLook({ v: 2, ref })).toEqual({ v: 2, ref });
    expect(parseShipLook({ v: 2, ref: 'ABC' })).toBeNull();
    expect(parseShipLook({ v: 2, ref, hull: 'bell' })).toBeNull();
  });

  it('受け取った印は、形が正しいものだけ使う（前の版の設計も印として読む）', () => {
    expect(lookOrNone({ v: 1, hull: 'bell' })).toEqual({ v: 2, hull: 'bell' });
    expect(lookOrNone({ v: 2, hull: 'ring' })).toEqual({ v: 2, hull: 'ring' });
    expect(lookOrNone({ v: 1, hull: 'arrow' })).toBeUndefined(); // やめた船体
    expect(lookOrNone({ v: 1, hull: '<script>' })).toBeUndefined();
    expect(lookOrNone({ v: 2, use: 0, customs: [blocks] })).toBeUndefined(); // ブロックそのものは部屋では受け付けない
    expect(isShipState({ anchor: 'Earth', offsetKm: { x: 1, y: 0, z: 0 }, velocityKmS: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } })).toBe(true);
  });
});
