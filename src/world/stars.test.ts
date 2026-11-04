import { describe, expect, it } from 'vitest';
import { apparentMagnitude, bvToRgb, decodeStars, starAppearance, STAR_STRIDE } from './stars';

describe('starAppearance', () => {
  it('明るい星（等級が小さい）ほど大きく明るい', () => {
    const sirius = starAppearance(-1.46);
    const polaris = starAppearance(1.98);
    const faint = starAppearance(6.5);
    expect(sirius.sizePx).toBeGreaterThan(polaris.sizePx);
    expect(polaris.sizePx).toBeGreaterThan(faint.sizePx);
    expect(polaris.intensity).toBeGreaterThan(faint.intensity);
  });

  it('肉眼の限界（6.5 等）の星は、それより暗い 9 等の星より明るい', () => {
    expect(starAppearance(6.5).intensity).toBeGreaterThan(starAppearance(9).intensity);
  });

  it('10 等までは消えず、大きさも 1 ピクセルより小さくならない', () => {
    expect(starAppearance(10).intensity).toBeGreaterThan(0);
    expect(starAppearance(12).sizePx).toBeGreaterThanOrEqual(1);
  });

  it('14 等より暗い星は消える（銀河の外から見て、遠くの星が重なって光らないように）', () => {
    expect(starAppearance(14).intensity).toBe(0);
    expect(starAppearance(12).intensity).toBeLessThan(starAppearance(10).intensity);
  });
});

describe('apparentMagnitude', () => {
  it('10 pc では絶対等級と同じ、10 倍遠いと 5 等暗い', () => {
    expect(apparentMagnitude(4.83, 10)).toBeCloseTo(4.83, 9);
    expect(apparentMagnitude(4.83, 100)).toBeCloseTo(9.83, 9);
  });
  it('シリウス（絶対等級 1.45・2.64 pc）は約 −1.4 等', () => {
    expect(apparentMagnitude(1.45, 2.637)).toBeCloseTo(-1.44, 1);
  });
});

describe('bvToRgb', () => {
  it('高温の青い星（B−V が小さい）は、低温の赤い星より青が強い', () => {
    const [r1, , b1] = bvToRgb(-0.03); // ベガ
    const [r2, , b2] = bvToRgb(1.85); // ベテルギウス
    expect(b1 / r1).toBeGreaterThan(b2 / r2);
  });

  it('色指数が無い星は、太陽くらいの色にする', () => {
    expect(bvToRgb(Number.NaN)).toEqual(bvToRgb(0.65));
  });
});

describe('decodeStars', () => {
  it('STAR_STRIDE 個ずつの数を 1 個の星として数える', () => {
    const buf = new Float32Array(STAR_STRIDE * 3).buffer;
    expect(decodeStars(buf).count).toBe(3);
  });

  it('長さが合わないデータは受け付けない', () => {
    expect(() => decodeStars(new Float32Array(7).buffer)).toThrow();
  });
});
