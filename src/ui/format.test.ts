import { describe, expect, it } from 'vitest';
import { formatDistance } from './format';
import { KM_PER_AU, KM_PER_LY } from '../world/units';

describe('formatDistance', () => {
  it('100 万 km 未満は km、それ以上は天文単位、0.1 光年以上は光年', () => {
    expect(formatDistance(20_000)).toBe('20,000 km');
    expect(formatDistance(KM_PER_AU)).toBe('1.00 天文単位');
    expect(formatDistance(4.24 * KM_PER_LY)).toBe('4.24 光年');
  });
});

describe('formatCoordinates', () => {
  it('3 つの軸で単位をそろえ、符号を付ける', async () => {
    const { formatCoordinates } = await import('./format');
    expect(formatCoordinates({ x: 1234, y: -56, z: 0 })).toEqual({ x: '+1,234', y: '−56', z: '+0', unit: 'km' });
    const au = 149_597_870.7;
    const c = formatCoordinates({ x: 1.234 * au, y: -0.5 * au, z: 0.01 * au });
    expect(c.unit).toBe('天文単位');
    expect(c.x).toBe('+1.23');
    expect(c.y).toBe('−0.50');
    expect(formatCoordinates({ x: 9.46e13, y: 0, z: 0 }).unit).toBe('光年');
  });
});
