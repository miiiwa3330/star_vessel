import { describe, expect, it } from 'vitest';
import { defaultDesignFor, HULL_TYPES, isShipDesign } from './ship-design';
import { designOrNone, isShipState } from './ship-schema';

describe('宇宙船の設計', () => {
  it('3 種類の船体のどれかで、版が合っていれば正しい', () => {
    for (const hull of HULL_TYPES) expect(isShipDesign({ v: 1, hull })).toBe(true);
    expect(isShipDesign({ v: 1, hull: 'ufo' })).toBe(false);
    expect(isShipDesign({ v: 2, hull: 'arrow' })).toBe(false);
    expect(isShipDesign({ v: 1, hull: 'arrow', extra: 1 })).toBe(false);
    expect(isShipDesign(null)).toBe(false);
    expect(isShipDesign([1])).toBe(false);
  });

  it('決めていない人の船は、id からいつも同じものに決まる', () => {
    expect(defaultDesignFor('abc')).toEqual(defaultDesignFor('abc'));
    const hulls = new Set(Array.from({ length: 50 }, (_, i) => defaultDesignFor(`user-${i}`).hull));
    expect(hulls.size).toBe(3);
  });

  it('部屋に届いた設計は、正しくなければ捨てる（状態は別に確かめる）', () => {
    expect(designOrNone({ v: 1, hull: 'disk' })).toEqual({ v: 1, hull: 'disk' });
    expect(designOrNone({ v: 1, hull: '<script>' })).toBeUndefined();
    expect(isShipState({ anchor: 'Earth', offsetKm: { x: 1, y: 0, z: 0 }, velocityKmS: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } })).toBe(true);
  });
});
