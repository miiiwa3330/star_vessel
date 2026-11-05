import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeGalaxies, galaxyFrame, galaxyPointCount, galaxyPoints } from './galaxies';
import { DEG } from './units';

const galaxies = decodeGalaxies(JSON.parse(readFileSync('public/data/galaxies.json', 'utf8')));
const named = (ja: string) => galaxies.find((g) => g.nameJa === ja)!;
const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => a.x * b.x + a.y * b.y + a.z * b.z;

describe('銀河（要件 F44）', () => {
  it('アンドロメダ銀河は約 77 万 pc 先、半径は約 2 万 pc', () => {
    const m31 = named('アンドロメダ銀河');
    expect(Math.hypot(m31.positionPc.x, m31.positionPc.y, m31.positionPc.z)).toBeCloseTo(770_000, -4);
    expect(m31.radiusPc).toBeGreaterThan(15_000);
    expect(m31.radiusPc).toBeLessThan(25_000);
  });

  it('太陽から見た長軸の向きと傾きが観測と合う（アンドロメダ銀河：長軸 35 度）', () => {
    const m31 = named('アンドロメダ銀河');
    const f = galaxyFrame(m31);
    const d = Math.hypot(m31.positionPc.x, m31.positionPc.y, m31.positionPc.z);
    const los = { x: m31.positionPc.x / d, y: m31.positionPc.y / d, z: m31.positionPc.z / d };
    // 長軸は見ている向きに垂直
    expect(Math.abs(dot(f.major, los))).toBeLessThan(1e-9);
    // 空の北から測った角度が 35 度
    const nl = Math.hypot(-los.x * los.z, -los.y * los.z, 1 - los.z * los.z);
    const north = { x: (-los.x * los.z) / nl, y: (-los.y * los.z) / nl, z: (1 - los.z * los.z) / nl };
    expect(Math.abs(dot(f.major, north))).toBeCloseTo(Math.cos(35 * DEG), 6);
    // 面に垂直な向きと見ている向きの角度が、傾き
    expect(Math.abs(dot(f.normal, los))).toBeCloseTo(Math.cos((m31.inclinationDeg ?? 0) * DEG), 6);
  });

  it('点は同じ銀河なら同じで、数は決まった範囲に収まる', () => {
    const g = named('さんかく座銀河');
    const n = galaxyPointCount(g);
    expect(n).toBeGreaterThan(1000);
    expect(Array.from(galaxyPoints(g, 200).positions)).toEqual(Array.from(galaxyPoints(g, 200).positions));
    const total = galaxies.reduce((s, x) => s + galaxyPointCount(x), 0);
    expect(total).toBeLessThan(800_000);
  });
});
