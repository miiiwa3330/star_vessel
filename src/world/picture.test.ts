import { describe, expect, it } from 'vitest';
import { clusterPicture, cometPicture, galaxyPicture, nebulaScale, starLuminosity, starPicture } from './picture';

describe('starPicture（恒星の絵）', () => {
  const sun = starPicture({ radiusSun: 1, teffK: 5772 });
  it('太陽は大きさ 0.5・光の広がり 0.5・粒の模様', () => {
    expect(sun).toEqual({ size: 0.5, glow: 0.5, surface: 'granules' });
    expect(starLuminosity({ radiusSun: 1, teffK: 5772 })).toBeCloseTo(1, 12);
  });
  it('赤色矮星は小さく暗く、黒点の模様（プロキシマ・ケンタウリ：0.154 太陽半径・2,992 K）', () => {
    const p = starPicture({ radiusSun: 0.154, teffK: 2992 });
    expect(p.size).toBeLessThan(sun.size);
    expect(p.glow).toBeLessThan(sun.glow);
    expect(p.surface).toBe('spots');
  });
  it('赤色超巨星は大きく明るく、巨大な対流の模様（ベテルギウス：約 760 太陽半径・3,600 K）', () => {
    const p = starPicture({ radiusSun: 760, teffK: 3600 });
    expect(p.size).toBeGreaterThan(0.95);
    expect(p.glow).toBeGreaterThan(0.95);
    expect(p.surface).toBe('cells');
  });
  it('高温の星はなめらか（シリウス：1.71 太陽半径・9,940 K）', () => {
    expect(starPicture({ radiusSun: 1.71, teffK: 9940 }).surface).toBe('smooth');
  });
  it('大きさ・光の広がりは範囲の中に収まる', () => {
    for (const r of [1e-5, 0.01, 1, 100, 5000]) {
      const p = starPicture({ radiusSun: r, teffK: 30000 });
      expect(p.size).toBeGreaterThanOrEqual(0.3);
      expect(p.size).toBeLessThanOrEqual(1);
      expect(p.glow).toBeGreaterThanOrEqual(0.2);
      expect(p.glow).toBeLessThanOrEqual(1);
    }
  });
});

describe('clusterPicture（星団の絵）', () => {
  const open = { kind: 'open' as const, members: 100, r50Pc: 2, rtPc: 10, logAge: 8 };
  it('メンバーが多いほど星が多い。上限と下限がある', () => {
    expect(clusterPicture({ ...open, members: 300 }).count).toBeGreaterThan(clusterPicture(open).count);
    expect(clusterPicture({ ...open, members: 3 }).count).toBe(20);
    expect(clusterPicture({ ...open, kind: 'globular', members: 1e6 }).count).toBe(1600);
  });
  it('半数半径が潮汐半径に対して小さいほど、中心に集まる', () => {
    expect(clusterPicture({ ...open, r50Pc: 1 }).core).toBeLessThan(clusterPicture(open).core);
    // 潮汐半径が無ければ、半数半径の 5 倍（宇宙の中の星団と同じ）
    expect(clusterPicture({ ...open, rtPc: null }).core).toBeCloseTo(1 / 1.305 / 5, 12);
  });
  it('若い星団は青く、古い星団は赤い', () => {
    expect(clusterPicture({ ...open, logAge: 7 }).warm).toBe(0);
    expect(clusterPicture({ ...open, logAge: 10 }).warm).toBe(1);
    expect(clusterPicture({ ...open, kind: 'globular', logAge: null }).warm).toBeGreaterThan(clusterPicture({ ...open, logAge: null }).warm);
  });
});

describe('galaxyPicture（銀河の絵）', () => {
  const g = { tType: 3, axisRatio: 0.33, inclinationDeg: 78, positionAngleDeg: 35, absB: -21.4 };
  it('型で形が決まる（宇宙の中と同じ分け方）', () => {
    expect(galaxyPicture({ ...g, tType: -3 }).shape).toBe('elliptical');
    expect(galaxyPicture({ ...g, tType: 0 }).shape).toBe('elliptical');
    expect(galaxyPicture(g).shape).toBe('spiral');
    expect(galaxyPicture({ ...g, tType: 10 }).shape).toBe('irregular');
    expect(galaxyPicture({ ...g, tType: null }).shape).toBe('irregular');
  });
  it('早い型の渦巻ほど、ふくらみが大きく、腕がきつく巻く', () => {
    const sa = galaxyPicture({ ...g, tType: 1 });
    const sd = galaxyPicture({ ...g, tType: 7 });
    expect(sa.bulge).toBeGreaterThan(sd.bulge);
    expect(sa.wind).toBeGreaterThan(sd.wind);
  });
  it('真横に近い銀河は寝かせて、真上から見る銀河は起こして見せる。傾きが無ければ軸の比から', () => {
    expect(galaxyPicture(g).pitch).toBeCloseTo((12 * Math.PI) / 180, 12);
    expect(galaxyPicture({ ...g, inclinationDeg: 0 }).pitch).toBe(1.45);
    expect(galaxyPicture({ ...g, inclinationDeg: null, axisRatio: 0.5 }).pitch).toBeCloseTo((30 * Math.PI) / 180, 9);
  });
  it('長軸の向き：東西（90 度）は回さない。南北（0 度）は 90 度回す', () => {
    expect(galaxyPicture({ ...g, positionAngleDeg: 90 }).rollDeg).toBe(0);
    expect(galaxyPicture({ ...g, positionAngleDeg: 0 }).rollDeg).toBe(90);
    expect(galaxyPicture({ ...g, positionAngleDeg: null }).rollDeg).toBeNull();
  });
  it('暗い銀河は小さく、まばら', () => {
    const dwarf = galaxyPicture({ ...g, absB: -10 });
    expect(dwarf.scale).toBe(0.5);
    expect(dwarf.density).toBe(0.25);
    expect(galaxyPicture({ ...g, absB: -22 }).scale).toBe(1);
  });
});

describe('nebulaScale・cometPicture', () => {
  it('大きな星雲ほど大きく（範囲の中）', () => {
    expect(nebulaScale(0.05)).toBe(0.4);
    expect(nebulaScale(1)).toBeCloseTo(0.62, 12);
    expect(nebulaScale(1000)).toBe(1);
  });
  it('明るい彗星ほど尾が長い。データが無ければ中くらい', () => {
    expect(cometPicture({ m1: 5.5, diameterKm: 11 }).tail).toBeGreaterThan(cometPicture({ m1: 15.7, diameterKm: 4.8 }).tail);
    expect(cometPicture({ m1: 0, diameterKm: null }).tail).toBe(1);
    expect(cometPicture({ m1: null, diameterKm: null })).toEqual({ tail: 0.5, coma: 0.13 });
  });
});
