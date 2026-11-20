import { describe, expect, it } from 'vitest';
import { trailStrength } from './vapor-trail';

describe('trailStrength（ベイパーの強さ）', () => {
  it('止まっていると 0。全速で 1', () => {
    expect(trailStrength(0, 500)).toBe(0);
    expect(trailStrength(250, 500)).toBe(0.5);
    expect(trailStrength(500, 500)).toBe(1);
  });
  it('ダッシュ（全速より速い）では 1.25 まで', () => {
    expect(trailStrength(5000, 500)).toBe(1.25);
  });
  it('全速が分からない（0）ときは出さない', () => {
    expect(trailStrength(10, 0)).toBe(0);
  });
});
