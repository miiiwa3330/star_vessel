import { describe, expect, it } from 'vitest';
import { clusterKey, describeHost, nearestStars, pickAimed, starKey, type InfoTarget } from './info';
import type { Cluster } from './clusters';

const target = (key: string, x: number, y: number, z: number, radiusKm?: number): InfoTarget => ({
  key,
  name: key,
  kind: 'planet',
  positionKm: { x, y, z },
  radiusKm,
  details: () => [],
});

describe('照準の先の天体', () => {
  const origin = { x: 0, y: 0, z: 0 };
  const forward = { x: 1, y: 0, z: 0 };

  it('見ている向きにいちばん近いものを選ぶ', () => {
    const a = target('a', 100, 3, 0); // 約 1.7 度
    const b = target('b', 100, 1, 0); // 約 0.6 度
    expect(pickAimed([a, b], origin, forward)?.key).toBe('b');
  });

  it('角度が範囲の外なら選ばない', () => {
    expect(pickAimed([target('a', 100, 20, 0)], origin, forward)).toBeNull();
    expect(pickAimed([target('a', -100, 0, 0)], origin, forward)).toBeNull();
  });

  it('大きく見える天体は、円のどこを見ていても選べる', () => {
    // 中心は 30 度ずれているが、見かけの半径が 40 度ほどある
    const big = target('big', 100, 57.7, 0, 75);
    expect(pickAimed([big], origin, forward)?.key).toBe('big');
  });

  it('見かけの円の中を見ているもの同士なら、手前を選ぶ', () => {
    const far = target('far', 1000, 0, 0, 100);
    const near = target('near', 100, 0, 0, 10);
    expect(pickAimed([far, near], origin, forward)?.key).toBe('near');
  });
});

describe('近くの恒星', () => {
  // x, y, z, 絶対等級, B−V, HYG の id
  const stars = new Float32Array([10, 0, 0, 1, 0.6, 7, 1, 0, 0, 1, 0.6, 8, 5, 0, 0, 1, 0.6, 9]);

  it('近い順に、太陽と自動で作った星も含めて返す', () => {
    const got = nearestStars({ x: 2, y: 0, z: 0 }, stars, 6, [{ position: { x: 3, y: 0, z: 0 }, system: 'G1' }], 3);
    expect(got.map((s) => s.system)).toEqual(['H8', 'G1', 'SOL']);
    expect(got[0].distancePc).toBeCloseTo(1);
  });

  it('数が足りなければ、あるだけ返す', () => {
    expect(nearestStars({ x: 0, y: 0, z: 0 }, new Float32Array(), 6, [], 5).map((s) => s.system)).toEqual(['SOL']);
  });
});

describe('記号と説明', () => {
  it('恒星の記号は、天体の一覧の恒星の id と同じ', () => {
    expect(starKey('SOL')).toBe('Sun');
    expect(starKey('H70666')).toBe('H70666.0');
    expect(clusterKey({ name: 'Melotte 22' } as Cluster)).toBe('C:Melotte 22');
  });

  it('恒星の説明に、距離と惑星の数が出る', () => {
    const lines = describeHost({ system: 'H1', positionPc: { x: 1.3, y: 0, z: 0 }, absMag: 4.4, bv: 0.7 }, 'テスト星', 2);
    expect(lines[0]).toContain('恒星');
    expect(lines.join(' ')).toContain('4.24 光年');
    expect(lines.join(' ')).toContain('惑星 2 個');
  });

  it('自動で作った星には、そのことを書く', () => {
    const lines = describeHost({ system: 'G1-2-3.4', positionPc: { x: 100, y: 0, z: 0 }, absMag: 5, bv: 0.6 }, '恒星 G', 0);
    expect(lines[0]).toContain('自動で作った星');
    expect(lines).toContain('惑星は無い');
  });
});
