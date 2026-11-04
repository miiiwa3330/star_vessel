import { describe, expect, it } from 'vitest';
import { Rotation_EQJ_GAL } from 'astronomy-engine';
import {
  armAt,
  cellOf,
  eqjPcToGalacto,
  EQJ_TO_GAL,
  galactoToEqjPc,
  generateCell,
  generatedSystemCode,
  parseGeneratedSystem,
  R0_KPC,
  relativeDensity,
  sampleGlow,
  SGR_RADIUS_AT_SUN_KPC,
  ARM_PITCH_DEG,
  meanDustDensity,
} from './galaxy';
import { hashInts, mulberry32 } from './random';

describe('座標', () => {
  it('EQJ → 銀河の座標の行列は、astronomy-engine と同じ', () => {
    const rot = Rotation_EQJ_GAL().rot; // 列ごとの並び
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(EQJ_TO_GAL[i * 3 + j]).toBeCloseTo(rot[j][i], 12);
  });

  it('太陽は銀河中心の座標で (−R0, 0, Z0)、銀河の中心は原点', () => {
    const sun = eqjPcToGalacto({ x: 0, y: 0, z: 0 });
    expect(sun.x).toBeCloseTo(-R0_KPC, 9);
    expect(sun.y).toBeCloseTo(0, 9);
    // 銀河の中心の方向（赤経 17h45m40s・赤緯 −29°00′28″）に R0 だけ進むと、原点の近く
    const ra = ((17 + 45 / 60 + 40.04 / 3600) * 15 * Math.PI) / 180;
    const de = (-(29 + 28.1 / 3600) * Math.PI) / 180;
    const d = R0_KPC * 1000;
    const gc = eqjPcToGalacto({ x: d * Math.cos(de) * Math.cos(ra), y: d * Math.cos(de) * Math.sin(ra), z: d * Math.sin(de) });
    expect(Math.hypot(gc.x, gc.y)).toBeLessThan(0.02);
  });

  it('行きと帰りで元に戻る', () => {
    const p = { x: 123, y: -4567, z: 89 };
    const q = galactoToEqjPc(eqjPcToGalacto(p));
    expect(q.x).toBeCloseTo(p.x, 6);
    expect(q.y).toBeCloseTo(p.y, 6);
    expect(q.z).toBeCloseTo(p.z, 6);
  });
});

/** 太陽から見て、腕の内側の部分（R < R0）が見える方向の端（接線の方向、銀経・度） */
function tangentLongitudes(k: number): { north: number; south: number } {
  const b = Math.tan((ARM_PITCH_DEG * Math.PI) / 180);
  let north = -Infinity;
  let south = Infinity;
  for (let i = -20000; i < 20000; i++) {
    const th = Math.PI + i * 0.0005;
    const r = SGR_RADIUS_AT_SUN_KPC * Math.exp(b * (th - Math.PI) + k * (Math.PI / 2) * b);
    if (r > R0_KPC || r < 2.5) continue;
    const l = (((Math.atan2(r * Math.sin(th), r * Math.cos(th) + R0_KPC) * 180) / Math.PI) + 360) % 360;
    if (l < 180) north = Math.max(north, l);
    else south = Math.min(south, l);
  }
  return { north, south };
}

describe('腕の形は観測と合う', () => {
  // 観測された腕の接線の方向（Vallée 2016 の集計による概略）
  it('いて・りゅうこつ腕：北 約 50 度・南 約 284 度', () => {
    const t = tangentLongitudes(0);
    expect(Math.abs(t.north - 50.5)).toBeLessThan(4);
    expect(Math.abs(t.south - 284)).toBeLessThan(4);
  });
  it('たて・ケンタウルス腕：北 約 32 度・南 約 309 度', () => {
    const t = tangentLongitudes(-1);
    expect(Math.abs(t.north - 32)).toBeLessThan(4);
    expect(Math.abs(t.south - 309)).toBeLessThan(4);
  });
  it('じょうぎ腕：南 約 328 度', () => {
    expect(Math.abs(tangentLongitudes(-2).south - 328)).toBeLessThan(4);
  });
});

describe('armAt', () => {
  const at = (r: number, thetaDeg = 180, z = 0) => {
    const t = (thetaDeg * Math.PI) / 180;
    return armAt({ x: r * Math.cos(t), y: r * Math.sin(t), z });
  };
  it('太陽はオリオン腕（いまある住所 MW-ORI-SOL-… と同じ）', () => {
    expect(armAt(eqjPcToGalacto({ x: 0, y: 0, z: 0 }))).toBe('ORI');
  });
  it('太陽の方向で、内から外へ じょうぎ → たて・ケンタウルス → いて・りゅうこつ → ペルセウス', () => {
    expect(at(3.4)).toBe('NOR');
    expect(at(4.9)).toBe('SCU');
    expect(at(7.2)).toBe('SGR');
    expect(at(10.5)).toBe('PER');
  });
  it('中心は中心部、遠く・高くはハロー', () => {
    expect(at(1)).toBe('BLG');
    expect(at(25)).toBe('HAL');
    expect(at(8, 180, 5)).toBe('HAL');
  });
});

describe('relativeDensity', () => {
  it('太陽のまわりで 1、中心に近いほど濃く、円盤から離れるほど薄い', () => {
    const sun = eqjPcToGalacto({ x: 0, y: 0, z: 0 });
    expect(relativeDensity(sun)).toBeCloseTo(1, 9);
    expect(relativeDensity({ x: -4, y: 0, z: 0 })).toBeGreaterThan(1);
    expect(relativeDensity({ x: -8.178, y: 0, z: 1 })).toBeLessThan(0.1);
    expect(relativeDensity({ x: -20, y: 0, z: 0 })).toBeLessThan(1e-6);
  });
});

describe('meanDustDensity', () => {
  it('円盤の面に沿って進むと 1、高いところでは薄い', () => {
    expect(meanDustDensity(0, 0)).toBeCloseTo(1, 3);
    expect(meanDustDensity(1, 1)).toBeLessThan(1e-3);
  });
  it('高さを少し変えても、急に変わらない（境目の線が出ない）', () => {
    const a = meanDustDensity(0.1, 0.0999);
    const b = meanDustDensity(0.1, 0.1001);
    expect(Math.abs(a - b)).toBeLessThan(0.01);
  });
  it('円盤を真上から突き抜けると、通るちりの量は高さの差に比べて少ない', () => {
    expect(meanDustDensity(-5, 5)).toBeLessThan(0.05);
  });
});

describe('random', () => {
  it('同じ種からは同じ並び', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
    expect(hashInts(1, 2, 3)).toBe(hashInts(1, 2, 3));
    expect(hashInts(1, 2, 3)).not.toBe(hashInts(3, 2, 1));
  });
});

describe('sampleGlow', () => {
  it('同じ種からは同じ銀河の形', () => {
    expect(sampleGlow(100).positions).toEqual(sampleGlow(100).positions);
  });
  it('ほとんどの光は円盤の中（銀河の北・南に 1.5 kpc 以内）', () => {
    const g = sampleGlow(2000);
    let inDisk = 0;
    for (let i = 0; i < g.count; i++) {
      const p = eqjPcToGalacto({ x: g.positions[i * 3], y: g.positions[i * 3 + 1], z: g.positions[i * 3 + 2] });
      if (Math.abs(p.z) < 1.5) inDisk++;
    }
    expect(inDisk / g.count).toBeGreaterThan(0.95);
  });
});

describe('generateCell', () => {
  // 太陽から銀河の中心の方へ 3 kpc（本物のデータの範囲の外）
  const far = galactoToEqjPc({ x: -5.2, y: 0, z: 0 });
  const cell = cellOf(far);

  it('同じマス目なら、いつも同じ星', () => {
    expect(generateCell(cell)).toEqual(generateCell(cell));
    expect(generateCell(cell).length).toBeGreaterThan(0);
  });

  it('作った星はマス目の中にあり、恒星系の記号からマス目に戻れる', () => {
    const stars = generateCell(cell);
    for (const s of stars.slice(0, 20)) {
      expect(cellOf(s.position)).toEqual(cell);
      expect(parseGeneratedSystem(s.system)?.cell).toEqual(cell);
    }
    expect(stars[3].system).toBe(generatedSystemCode(cell, 3));
  });

  it('本物のデータの範囲（太陽から 1,000 pc）の中では作らない', () => {
    expect(generateCell(cellOf({ x: 100, y: 0, z: 0 }))).toEqual([]);
  });
});
