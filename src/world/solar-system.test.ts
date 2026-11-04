import { describe, expect, it } from 'vitest';
import { RotationAxis, Body } from 'astronomy-engine';
import { bodyFixedToEqj, heliocentricPositionKm } from './solar-system';
import { KM_PER_AU } from './units';
import { length, mulVec, normalize, scale, sub, transpose } from './vec';

/** 太陽が真上に来る地点（緯度・経度、度）。地球の向きが現実と合っているかの確かめに使う */
function subsolarPoint(date: Date) {
  const sunDir = normalize(scale(heliocentricPositionKm('Earth', date), -1));
  const b = mulVec(transpose(bodyFixedToEqj('Earth', date)), sunDir);
  return {
    lat: (Math.asin(b.z) * 180) / Math.PI,
    lon: (Math.atan2(b.y, b.x) * 180) / Math.PI,
  };
}

const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('heliocentricPositionKm', () => {
  it('地球と太陽の距離は 1 天文単位前後（近日点 0.983・遠日点 1.017）', () => {
    for (const iso of ['2026-01-03T00:00:00Z', '2026-07-06T00:00:00Z', '2026-11-04T00:00:00Z']) {
      const au = length(heliocentricPositionKm('Earth', new Date(iso))) / KM_PER_AU;
      expect(au).toBeGreaterThan(0.98);
      expect(au).toBeLessThan(1.02);
    }
  });

  it('月は地球から約36万〜41万 km', () => {
    const d = new Date('2026-11-04T00:00:00Z');
    const km = length({
      x: heliocentricPositionKm('Moon', d).x - heliocentricPositionKm('Earth', d).x,
      y: heliocentricPositionKm('Moon', d).y - heliocentricPositionKm('Earth', d).y,
      z: heliocentricPositionKm('Moon', d).z - heliocentricPositionKm('Earth', d).z,
    });
    expect(km).toBeGreaterThan(356_000);
    expect(km).toBeLessThan(407_000);
  });
});

describe('bodyFixedToEqj', () => {
  it('天体の z 軸（北極）は astronomy-engine の北極の向きと一致する', () => {
    const d = new Date('2026-11-04T12:00:00Z');
    for (const id of ['Earth', 'Mars', 'Jupiter', 'Moon'] as const) {
      const pole = mulVec(bodyFixedToEqj(id, d), { x: 0, y: 0, z: 1 });
      const north = RotationAxis(Body[id], d).north;
      expect(pole.x).toBeCloseTo(north.x, 9);
      expect(pole.y).toBeCloseTo(north.y, 9);
      expect(pole.z).toBeCloseTo(north.z, 9);
    }
  });

  it('UTC の正午には、太陽はおよそ経度 0 度の真上にある（均時差の分だけずれる）', () => {
    const p = subsolarPoint(new Date('2026-03-20T12:00:00Z'));
    expect(angleDiff(p.lon, 0)).toBeLessThan(5);
  });

  it('UTC の 0 時には、太陽はおよそ経度 180 度の真上にある', () => {
    const p = subsolarPoint(new Date('2026-03-21T00:00:00Z'));
    expect(angleDiff(p.lon, 180)).toBeLessThan(5);
  });

  it('6 時間たつと、太陽の真下の経度は西へ約 90 度動く', () => {
    const a = subsolarPoint(new Date('2026-11-04T00:00:00Z'));
    const b = subsolarPoint(new Date('2026-11-04T06:00:00Z'));
    expect(angleDiff(a.lon - 90, b.lon)).toBeLessThan(1);
  });

  it('夏至には太陽の真下は北緯約 23.4 度、冬至には南緯約 23.4 度', () => {
    expect(subsolarPoint(new Date('2026-06-21T12:00:00Z')).lat).toBeCloseTo(23.4, 0);
    expect(subsolarPoint(new Date('2026-12-21T12:00:00Z')).lat).toBeCloseTo(-23.4, 0);
  });
});

describe('ガリレオ衛星', () => {
  it('木星からの距離は軌道長半径に近い（イオ 42.2 万 km・カリスト 188.3 万 km）', async () => {
    const { heliocentricPositionKm: pos } = await import('./solar-system');
    const d = new Date('2026-11-04T00:00:00Z');
    const dist = (id: string) => length(sub(pos(id, d), pos('Jupiter', d)));
    expect(dist('S5.1')).toBeGreaterThan(415_000);
    expect(dist('S5.1')).toBeLessThan(430_000);
    expect(dist('S5.4')).toBeGreaterThan(1_850_000);
    expect(dist('S5.4')).toBeLessThan(1_910_000);
  });

  it('潮汐ロック：本初子午線（x 軸）はいつも木星の方を向く', () => {
    for (const iso of ['2026-11-04T00:00:00Z', '2026-11-05T07:00:00Z']) {
      const d = new Date(iso);
      const x = mulVec(bodyFixedToEqj('S5.2', d), { x: 1, y: 0, z: 0 });
      const toJ = normalize(sub(heliocentricPositionKm('Jupiter', d), heliocentricPositionKm('S5.2', d)));
      expect(x.x * toJ.x + x.y * toJ.y + x.z * toJ.z).toBeCloseTo(1, 9);
    }
  });
});
