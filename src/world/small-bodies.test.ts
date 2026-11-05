import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { keplerPositionKm, type KeplerElements } from './kepler';
import { largeAsteroidBodies, moonBodies, parseEpoch, type LargeAsteroid, type MoonRecord } from './small-bodies';
import { majorGmKm3s2 } from './solar-system';
import { length, sub, type Vec3 } from './vec';

const moons = moonBodies(
  (JSON.parse(readFileSync('public/data/moons.json', 'utf8')) as { moons: MoonRecord[] }).moons,
  { gm: majorGmKm3s2 },
);
const large = largeAsteroidBodies(
  (JSON.parse(readFileSync('public/data/asteroids-large.json', 'utf8')) as { large: LargeAsteroid[] }).large,
);
const rel = (bodies: typeof moons, id: string, date: Date): Vec3 => {
  const b = bodies.find((x) => x.id === id)!;
  return keplerPositionKm((b.motion as { elements: KeplerElements }).elements, date);
};

/**
 * 正解：JPL Horizons の位置（2026-11-05 00:00 TDB、ICRF、親の天体の中心から、km）。2026-11-05 に取得。
 * 平均軌道要素からの位置なので、ぴったりは合わない。軌道の半径に対するずれの割合で確かめる
 */
const DATE = new Date('2026-11-05T00:00:00Z');
const HORIZONS: Record<string, Vec3> = {
  'S6.6': { x: -1.581867491165206e5, y: 1.220101422818135e6, z: -6.781957397878068e4 }, // タイタン（土星から）
  'S8.1': { x: 2.932105684680527e5, y: 1.996948102365671e5, z: -1.487781783375865e3 }, // トリトン（海王星から）
  'S4.1': { x: -8.569772057138878e3, y: -1.292462650842788e3, z: 3.912582363780225e3 }, // フォボス（火星から）
  A1: { x: -1.317571304903548e7, y: 3.569201063742787e8, z: 1.710357960599394e8 }, // ケレス（太陽から）
  A136199: { x: 1.272562825362965e10, y: 6.47675032274141e9, z: 1.765931552573219e6 }, // エリス（太陽から）
};

describe('衛星（JPL の平均軌道要素）', () => {
  it('元期の書き方を読める', () => {
    expect(parseEpoch('2000-01-01.5')).toBe(Date.UTC(2000, 0, 1, 12));
    expect(parseEpoch('2026-11-01.0')).toBe(Date.UTC(2026, 10, 1));
  });

  it('月とガリレオ衛星はデータから作らない（astronomy-engine の方が正確）', () => {
    expect(moons.some((m) => ['S3.1', 'S5.1', 'S5.4'].includes(m.id))).toBe(false);
    expect(moons.find((m) => m.id === 'S6.6')?.nameJa).toBe('タイタン');
  });

  // 元期（2026-11-01）から 4 日後。速く回る衛星ほどずれがたまる（フォボスは 4 日で約 12 周）
  for (const [id, tol] of [['S6.6', 0.01], ['S8.1', 0.01], ['S4.1', 0.06]] as const) {
    it(`${id} の位置は Horizons と軌道の半径の ${tol * 100}% 以内で合う`, () => {
      const p = rel(moons, id, DATE);
      const err = length(sub(p, HORIZONS[id])) / length(HORIZONS[id]);
      expect(err).toBeLessThan(tol);
    });
  }
});

describe('大きな小惑星・準惑星（JPL SBDB）', () => {
  for (const id of ['A1', 'A136199']) {
    it(`${id} の位置は Horizons と太陽からの距離の 0.1% 以内で合う`, () => {
      const p = rel(large, id, DATE);
      const err = length(sub(p, HORIZONS[id])) / length(HORIZONS[id]);
      expect(err).toBeLessThan(0.001);
    });
  }

  it('ケレス・エリスは準惑星、名前は日本語', () => {
    const ceres = large.find((b) => b.id === 'A1')!;
    expect(ceres.kind).toBe('dwarf');
    expect(ceres.nameJa).toBe('ケレス');
    expect(large.find((b) => b.id === 'A136199')!.radiusKm).toBe(1163);
  });
});

describe('衛星の名前', () => {
  it('どの衛星も軌道が楕円で、位置が数になる（仮符号の衛星も）', () => {
    for (const r of (JSON.parse(readFileSync('public/data/moons.json', 'utf8')) as { moons: MoonRecord[] }).moons) {
      expect(r.e, r.name).toBeLessThan(1);
      expect(r.a, r.name).toBeGreaterThan(0);
      expect(r.P, r.name).toBeGreaterThan(0);
      expect(r.radius, r.name).toBeGreaterThan(0);
    }
  });

  it('同じ衛星を 2 回入れない（JPL の表にパックが 2 行あった）', () => {
    const ids = moons.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('日本語の名前がある衛星は日本語、仮符号は S/年 惑星 番号 の形', () => {
    const name = (id: string) => moons.find((m) => m.id === id)!.nameJa;
    expect(name('S5.16')).toBe('メティス');
    expect(name('S5.19')).toBe('メガクリテ');
    expect(name('S7.15')).toBe('パック');
    expect(name('S5.51')).toBe('S/2010 J 1');
    expect(moons.every((m) => m.nameJa.length > 0 && !m.nameJa.includes('_'))).toBe(true);
  });
});
