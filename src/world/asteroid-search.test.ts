import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { asteroidPositionKm, diameterFromH, findAsteroidByNumber, findNearbyAsteroids, meanAnomalyAtDays } from './asteroid-search';
import { smallAsteroidBody } from './small-bodies';
import { keplerPositionKm, type KeplerElements } from './kepler';
import { KM_PER_AU } from './units';
import { length, sub } from './vec';

const buf = readFileSync('public/data/asteroids-0.bin');
const chunk = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const DATE = new Date('2026-11-05T00:00:00Z');
/** ケレス（太陽から・ICRF・km）。JPL Horizons、2026-11-05 00:00 TDB、2026-11-05 に取得 */
const CERES = { x: -1.317571304903548e7, y: 3.569201063742787e8, z: 1.710357960599394e8 };

describe('光の点の平均近点角（32bit の計算）', () => {
  const TWO_PI = 2 * Math.PI;
  const GAUSS_K = 0.01720209895;
  // 太陽から 3 AU の小惑星（典型的な小惑星帯の天体）。a = 3 のときの 1 日の角度
  const A = 3;
  const n = GAUSS_K / (A * Math.sqrt(A));
  const BASE = 9_800.25;
  const m0 = 1.234;
  const epoch = 9_000;

  it('倍精度で出した値と同じ角度になる', () => {
    const m = meanAnomalyAtDays(m0, A, epoch, BASE);
    expect(Math.abs(m)).toBeLessThanOrEqual(Math.PI);
    const exact = m0 + n * (BASE - epoch);
    const diff = (m - exact) / TWO_PI;
    expect(Math.abs(diff - Math.round(diff))).toBeLessThan(1e-12);
  });

  it('前の作り（J2000.0 からの日数を 32bit で渡す）と違い、1 分の間も細かく進む', () => {
    const f = Math.fround;
    const base = f(meanAnomalyAtDays(m0, A, epoch, BASE));
    const old: number[] = [];
    const now: number[] = [];
    for (let s = 0; s <= 60; s++) {
      const days = BASE + s / 86_400;
      old.push(f(f(m0) + f(f(n) * f(f(days) - f(epoch)))));
      now.push(f(base + f(f(n) * f(days - BASE))));
    }
    const steps = (l: readonly number[]) => new Set(l).size;
    // 前の作りは 1 分の間ほとんど止まり、たまに大きく飛ぶ。いまの作りは数秒ごとに、1 目盛りずつ進む
    expect(steps(old)).toBeLessThan(3);
    expect(steps(now)).toBeGreaterThan(3);
    const biggest = Math.max(...now.slice(1).map((v, i) => Math.abs(v - now[i])));
    const kmPerRad = A * KM_PER_AU;
    expect(biggest * kmPerRad).toBeLessThan(250);
  });
});

describe('近くの小惑星を探す', () => {
  it('光の点のデータ（32bit）からの位置でも、ケレスは Horizons と 0.1% 以内', () => {
    const o = [...Array(chunk.length / 9).keys()].find((k) => chunk[k * 9] === 1)! * 9;
    const p = asteroidPositionKm(chunk, o, DATE);
    expect(length(sub(p, CERES)) / length(CERES)).toBeLessThan(0.001);
  });

  it('ケレスのそばでは、ケレスがいちばん近い', () => {
    const near = findNearbyAsteroids([chunk], { x: CERES.x + 1e5, y: CERES.y, z: CERES.z }, DATE, 2e6, 8);
    expect(near[0].number).toBe(1);
    expect(near[0].distanceKm).toBeLessThan(2e5);
  });

  it('番号で探せて、球の天体にすると同じ場所に来る', () => {
    const eros = findAsteroidByNumber([chunk], 433)!;
    expect(eros).not.toBeNull();
    const body = smallAsteroidBody(eros);
    expect(body.id).toBe('A433');
    const fromBody = keplerPositionKm((body.motion as { elements: KeplerElements }).elements, DATE);
    const o = [...Array(chunk.length / 9).keys()].find((k) => chunk[k * 9] === 433)! * 9;
    expect(length(sub(fromBody, asteroidPositionKm(chunk, o, DATE)))).toBeLessThan(1);
  });

  it('H から直径を推定する（H = 15・反射率 0.15 で約 3.4 km）', () => {
    expect(diameterFromH(15)).toBeCloseTo(3.43, 1);
  });
});
