import { describe, expect, it } from 'vitest';
import { GRID, MAX_BLOCKS, type Block } from './ship-blocks';
import { BuildDoc, FLOOR_Y, mirroredPositions, placementFor, planeHit, raycast, regionFor, retile, type V3 } from './ship-builder';

const NO_MIRROR = { x: false, z: false };

describe('作る画面：指した先', () => {
  it('何も無ければ床に当たり、床の上に置く（下から当てたら床の下）', () => {
    const doc = new BuildDoc();
    const hit = raycast(doc.occupancy, [41.3, 100, 37.7], [0, -1, 0]);
    expect(hit).toMatchObject({ kind: 'floor', sign: 1 });
    expect(placementFor(hit!, 1)).toEqual([40, FLOOR_Y, 36]);
    expect(placementFor(hit!, 0)).toEqual([41, FLOOR_Y, 37]);
    const below = raycast(doc.occupancy, [41.3, -20, 37.7], [0, 1, 0]);
    expect(below).toMatchObject({ kind: 'floor', sign: -1 });
    expect(placementFor(below!, 2)).toEqual([40, FLOOR_Y - 4, 36]);
  });

  it('ブロックの面に当たり、その面にくっつけて置く', () => {
    const doc = new BuildDoc([{ x: 40, y: 40, z: 40, s: 1, c: 0 }]);
    // 横（+X の外）から
    const side = raycast(doc.occupancy, [100, 40.6, 40.4], [-1, 0, 0]);
    expect(side).toMatchObject({ kind: 'block', index: 0, axis: 0, sign: 1 });
    expect(placementFor(side!, 1)).toEqual([42, 40, 40]);
    // 上から斜めに
    const top = raycast(doc.occupancy, [40.5, 60, 20], [0, -18, 21]);
    expect(top).toMatchObject({ kind: 'block', axis: 1, sign: 1 });
    expect(placementFor(top!, 0)[1]).toBe(42);
    // −Z の面に、0.5 m のブロック
    const front = raycast(doc.occupancy, [40.2, 41.7, -5], [0, 0, 1]);
    expect(front).toMatchObject({ kind: 'block', axis: 2, sign: -1 });
    expect(placementFor(front!, 0)).toEqual([40, 41, 39]);
  });

  it('範囲の端では、はみ出さないよう内側へ寄せる', () => {
    const doc = new BuildDoc([{ x: GRID - 2, y: 40, z: 0, s: 1, c: 0 }]);
    const hit = raycast(doc.occupancy, [GRID - 0.5, 100, 0.5], [0, -1, 0]);
    const pos = placementFor(hit!, 2);
    expect(pos[0]).toBe(GRID - 4);
    expect(pos[2]).toBe(0);
  });

  it('外れた向きなら当たらない', () => {
    expect(raycast(new BuildDoc().occupancy, [40, 100, 40], [0, 1, 0])).toBeNull();
  });
});

describe('作る画面：置く・消す・塗る', () => {
  it('左右・前後の対称で、4 つ置く。真ん中にまたがる位置は 1 つ', () => {
    expect(mirroredPositions([10, 40, 10], 1, { x: true, z: true })).toEqual([
      [10, 40, 10],
      [68, 40, 10],
      [10, 40, 68],
      [68, 40, 68],
    ]);
    expect(mirroredPositions([39, 40, 39], 1, { x: true, z: true })).toEqual([[39, 40, 39]]);
    const doc = new BuildDoc();
    expect(doc.place([10, 40, 10], 1, 3, { x: true, z: true })).toBe(true);
    expect(doc.blocks.length).toBe(4);
    // 1 つ消すと、映した 3 つも消える
    expect(doc.eraseRegion([10, 40, 68], 1, { x: true, z: true })).toBe(true);
    expect(doc.blocks.length).toBe(0);
  });

  it('重なる所には置かない。元に戻す・やり直す', () => {
    const doc = new BuildDoc();
    const pos: V3 = [40, 40, 40];
    expect(doc.place(pos, 2, 0, NO_MIRROR)).toBe(true);
    expect(doc.place([41, 41, 41], 0, 0, NO_MIRROR)).toBe(false);
    expect(doc.paintRegion(pos, 2, 5, NO_MIRROR)).toBe(true);
    expect(doc.blocks).toEqual([{ x: 40, y: 40, z: 40, s: 2, c: 5 }]); // 全部塗ったら、2 m のまま
    expect(doc.paintRegion(pos, 2, 5, NO_MIRROR)).toBe(false);
    expect(doc.undo()).toBe(true);
    expect(doc.blocks[0].c).toBe(0);
    expect(doc.redo()).toBe(true);
    expect(doc.blocks[0].c).toBe(5);
    doc.undo();
    doc.undo();
    expect(doc.blocks.length).toBe(0);
    expect(doc.canUndo).toBe(false);
  });

  it('数の上限を超えては置かない', () => {
    const many: Block[] = [];
    for (let i = 0; many.length < MAX_BLOCKS; i++) many.push({ x: i % GRID, y: Math.floor(i / GRID) % GRID, z: Math.floor(i / GRID / GRID), s: 0, c: 0 });
    const doc = new BuildDoc(many);
    expect(doc.place([0, 60, 0], 0, 0, NO_MIRROR)).toBe(false);
  });
});

describe('作る画面：大きさを選んで消す・塗る', () => {
  it('2 m のブロックの 1 m 分を消すと、残りは 1 m のブロック 7 つ', () => {
    const doc = new BuildDoc([{ x: 40, y: 40, z: 40, s: 2, c: 3 }]);
    expect(doc.eraseRegion([42, 42, 42], 1, NO_MIRROR)).toBe(true);
    expect(doc.blocks.length).toBe(7);
    expect(doc.blocks.every((b) => b.s === 1 && b.c === 3)).toBe(true);
    expect(doc.occupancy.filter((v) => v >= 0).length).toBe(64 - 8);
  });

  it('2 m のブロックの 0.5 m 分を塗ると、塗った 1 マスと、残りは 1 m 7 つ・0.5 m 7 つ', () => {
    const doc = new BuildDoc([{ x: 40, y: 40, z: 40, s: 2, c: 3 }]);
    expect(doc.paintRegion([40, 40, 40], 0, 9, NO_MIRROR)).toBe(true);
    const painted = doc.blocks.filter((b) => b.c === 9);
    expect(painted).toEqual([{ x: 40, y: 40, z: 40, s: 0, c: 9 }]);
    expect(doc.blocks.filter((b) => b.s === 1).length).toBe(7);
    expect(doc.blocks.filter((b) => b.s === 0).length).toBe(8);
  });

  it('大きい範囲で消すと、中の小さいブロックをまとめて消す（範囲の外は残る）', () => {
    const doc = new BuildDoc([
      { x: 40, y: 40, z: 40, s: 0, c: 0 },
      { x: 41, y: 41, z: 41, s: 0, c: 0 },
      { x: 44, y: 40, z: 40, s: 0, c: 0 },
    ]);
    expect(doc.eraseRegion([40, 40, 40], 2, NO_MIRROR)).toBe(true);
    expect(doc.blocks).toEqual([{ x: 44, y: 40, z: 40, s: 0, c: 0 }]);
  });

  it('当たったマスから範囲を決める（大きさの格子にそろえる）。床には範囲が無い', () => {
    const doc = new BuildDoc([{ x: 40, y: 40, z: 40, s: 2, c: 0 }]);
    const hit = raycast(doc.occupancy, [43.5, 100, 42.5], [0, -1, 0])!;
    expect(hit).toMatchObject({ kind: 'block', cell: [43, 43, 42] });
    expect(regionFor(hit, 1)).toEqual([42, 42, 42]);
    expect(regionFor(hit, 0)).toEqual([43, 43, 42]);
    expect(regionFor(raycast(new BuildDoc().occupancy, [40, 100, 40], [0, -1, 0])!, 1)).toBeNull();
  });

  it('並べ直し：同じ色なら元の大きさのまま', () => {
    const b = { x: 0, y: 0, z: 0, s: 2 as const, c: 4 };
    expect(retile(b, new Int16Array(64).fill(4))).toEqual([b]);
  });
});

describe('作る画面：ロック中のなぞり置き', () => {
  it('最初に置いた面と同じ平面に沿って置き、なぞりは元に戻す 1 回分', () => {
    const doc = new BuildDoc();
    const first = raycast(doc.occupancy, [40.5, 100, 40.5], [0, -1, 0])!;
    doc.beginStroke();
    doc.place(placementFor(first, 1), 1, 0, NO_MIRROR);
    for (const x of [42.5, 44.5, 46.5]) {
      // 置いたブロックの上ではなく、床と同じ平面に当てる
      const hit = planeHit([x, 100, 40.5], [0, -1, 0], first.axis, first.sign, first.face)!;
      expect(placementFor(hit, 1)[1]).toBe(FLOOR_Y);
      doc.place(placementFor(hit, 1), 1, 0, NO_MIRROR);
    }
    doc.endStroke();
    expect(doc.blocks.length).toBe(4);
    expect(doc.undo()).toBe(true);
    expect(doc.blocks.length).toBe(0);
    expect(doc.canUndo).toBe(false);
  });
});
