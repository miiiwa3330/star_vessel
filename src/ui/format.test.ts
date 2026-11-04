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
