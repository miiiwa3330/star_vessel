import { describe, expect, it } from 'vitest';
import { PALETTE, type Block } from './ship-blocks';
import { buildShipMesh } from './voxel-mesh';

const glowIndex = PALETTE.findIndex((p) => p.glow);
const quads = (m: ReturnType<typeof buildShipMesh>) => (m.solid.indices.length + m.glow.indices.length) / 6;

/** 三角形の面積と法線の向きの合計（閉じた形なら、外向きの面の和は 0。体積は発散定理で） */
function volume(m: ReturnType<typeof buildShipMesh>): number {
  let v = 0;
  for (const part of [m.solid, m.glow]) {
    const p = part.positions;
    for (let i = 0; i < part.indices.length; i += 3) {
      const [a, b, c] = [part.indices[i], part.indices[i + 1], part.indices[i + 2]].map((k) => [p[k * 3], p[k * 3 + 1], p[k * 3 + 2]]);
      v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
  }
  return v;
}

describe('ブロックの船を面にする', () => {
  it('1 つのブロックは 6 枚の面で、体積はブロックの大きさ（面が外を向いている）', () => {
    const m = buildShipMesh([{ x: 10, y: 10, z: 10, s: 1, c: 0 }]);
    expect(quads(m)).toBe(6);
    expect(volume(m)).toBeCloseTo(1, 6);
    expect(m.sizeM).toEqual({ x: 1, y: 1, z: 1 });
    expect(m.centerM).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('同じ色で並んだブロックは、まとめて 6 枚。くっついた面は出さない', () => {
    const row: Block[] = [0, 2, 4, 6].map((x) => ({ x, y: 0, z: 0, s: 1, c: 2 }));
    const m = buildShipMesh(row);
    expect(quads(m)).toBe(6);
    expect(volume(m)).toBeCloseTo(4, 6);
    expect(m.lengthM).toBe(4);
  });

  it('大きさの違うブロックが混ざっても、体積が合う', () => {
    const m = buildShipMesh([
      { x: 0, y: 0, z: 0, s: 2, c: 0 },
      { x: 4, y: 0, z: 0, s: 1, c: 0 },
      { x: 4, y: 2, z: 0, s: 0, c: 5 },
    ]);
    expect(volume(m)).toBeCloseTo(8 + 1 + 0.125, 6);
  });

  it('光る色の面は、別の入れ物に入る', () => {
    const m = buildShipMesh([
      { x: 0, y: 0, z: 0, s: 1, c: 0 },
      { x: 2, y: 0, z: 0, s: 1, c: glowIndex },
    ]);
    expect(m.solid.indices.length / 6).toBe(5);
    expect(m.glow.indices.length / 6).toBe(5);
  });

  it('作る画面では、範囲の真ん中が原点（ブロックを足しても位置が動かない）', () => {
    const m = buildShipMesh([{ x: 40, y: 40, z: 40, s: 1, c: 0 }], 'grid');
    expect(Math.min(...m.solid.positions)).toBeCloseTo(0, 6);
    expect(Math.max(...m.solid.positions)).toBeCloseTo(1, 6);
  });
});
