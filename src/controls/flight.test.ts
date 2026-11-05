import { describe, expect, it } from 'vitest';
import { verticalInput } from './flight';

const input = (...codes: string[]) => verticalInput(new Set(codes));

describe('verticalInput', () => {
  it('Space で上昇、Shift＋Space で下降', () => {
    expect(input('Space')).toBe(1);
    expect(input('Space', 'ShiftLeft')).toBe(-1);
    expect(input('Space', 'ShiftRight')).toBe(-1);
  });

  it('Shift だけでは動かない（ホイールの 10 倍と同時に使える）', () => {
    expect(input('ShiftLeft')).toBe(0);
    expect(input()).toBe(0);
  });

  it('R・F でも上下でき、逆向きを同時に押すと打ち消す', () => {
    expect(input('KeyR')).toBe(1);
    expect(input('KeyF')).toBe(-1);
    expect(input('KeyF', 'Space')).toBe(0);
  });
});
