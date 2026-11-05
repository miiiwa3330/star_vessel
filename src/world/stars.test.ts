import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyStarMotion, apparentMagnitude, bvToRgb, decodeStars, starAppearance, STAR_STRIDE, STAR_LIMITS, DEFAULT_STAR_LIMIT, yearsSinceJ2000 } from './stars';

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

  it('写真（14 等まで）では 12 等までは消えず、大きさも 1 ピクセルより小さくならない', () => {
    expect(starAppearance(12, STAR_LIMITS.photo).intensity).toBeGreaterThan(0);
    expect(starAppearance(12, STAR_LIMITS.photo).sizePx).toBeGreaterThanOrEqual(1);
  });

  it('見える限界より暗い星は消える（肉眼 6.5 等・双眼鏡 9 等・写真 14 等）', () => {
    expect(starAppearance(14, STAR_LIMITS.photo).intensity).toBe(0);
    expect(starAppearance(9, STAR_LIMITS.binoculars).intensity).toBe(0);
    expect(starAppearance(6.5, STAR_LIMITS.naked).intensity).toBe(0);
    expect(starAppearance(4.5, STAR_LIMITS.naked).intensity).toBeGreaterThan(0);
    expect(starAppearance(13.5, STAR_LIMITS.photo).intensity).toBeLessThan(starAppearance(10, STAR_LIMITS.photo).intensity);
  });

  it('最初の見え方は双眼鏡', () => {
    expect(DEFAULT_STAR_LIMIT).toBe('binoculars');
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

describe('星の動き（要件 F5）', () => {
  it('Barnard 星（HYG 87665）を動かすと、Gaia DR3 の 2016 年の位置に合う', () => {
    const buf = (p: string) => {
      const b = readFileSync(p);
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer;
    };
    const { data } = decodeStars(buf('public/data/stars.bin'));
    const motion = new Float32Array(buf('public/data/stars-motion.bin'));
    let o = -1;
    for (let i = 0; i < data.length; i += STAR_STRIDE) if (data[i + 5] === 87665) o = i;
    const dirOf = () => {
      const d = Math.hypot(data[o], data[o + 1], data[o + 2]);
      return { ra: (Math.atan2(data[o + 1], data[o]) * 180) / Math.PI + 360, dec: (Math.asin(data[o + 2] / d) * 180) / Math.PI };
    };
    const before = dirOf();
    applyStarMotion(data, motion, 16);
    const after = dirOf();
    // Gaia DR3（2016.0）：赤経 269.448503 度、赤緯 4.739420 度
    // HYG の速さの桁が少ないので、8 秒角くらいのずれが残る（動かさなければ 165 秒角ずれる）
    expect(Math.abs(after.dec - 4.73942)).toBeLessThan(15 / 3600);
    expect(Math.abs(after.ra - 269.448503)).toBeLessThan(15 / 3600);
    // 16 年で 2.7 分角くらい北へ動く
    expect(after.dec - before.dec).toBeGreaterThan(2 / 60);
  });

  it('星のデータと長さが合わなければ失敗にする', () => {
    expect(() => applyStarMotion(new Float32Array(6), new Float32Array(2), 1)).toThrow();
  });

  it('J2000.0 からの年数', () => {
    expect(yearsSinceJ2000(new Date(Date.UTC(2000, 0, 1, 12)))).toBe(0);
    expect(yearsSinceJ2000(new Date(Date.UTC(2026, 0, 1, 12)))).toBeCloseTo(26, 1);
  });
});
