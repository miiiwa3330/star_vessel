import { describe, expect, it } from 'vitest';
import { bvToRgb, decodeStars, starAppearance, STAR_STRIDE } from './stars';

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

  it('どんなに暗い星も、明るさ 0・大きさ 1 ピクセル未満にはならない', () => {
    expect(starAppearance(12).intensity).toBeGreaterThan(0);
    expect(starAppearance(12).sizePx).toBeGreaterThanOrEqual(1);
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
  it('5 個ずつの数を 1 個の星として数える', () => {
    const buf = new Float32Array(STAR_STRIDE * 3).buffer;
    expect(decodeStars(buf).count).toBe(3);
  });

  it('長さが合わないデータは受け付けない', () => {
    expect(() => decodeStars(new Float32Array(7).buffer)).toThrow();
  });
});
