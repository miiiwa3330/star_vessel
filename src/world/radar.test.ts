import { describe, expect, it } from 'vitest';
import { chooseRadarLabels, radarBlips, type RadarTarget } from './radar';
import type { Quat } from './quat';

const identity: Quat = { x: 0, y: 0, z: 0, w: 1 };
const origin = { x: 0, y: 0, z: 0 };
const target = (x: number, y: number, z: number, id = 't'): RadarTarget => ({
  kind: 'body',
  id,
  label: id,
  positionKm: { x, y, z },
});

describe('radarBlips', () => {
  it('前（−Z）にある物は円の上、右（+X）は右、後ろは下', () => {
    const [ahead, right, behind] = radarBlips(origin, identity, [
      target(0, 0, -1e6),
      target(1e6, 0, 0),
      target(0, 0, 1e6),
    ]);
    expect(ahead.y).toBeGreaterThan(0);
    expect(Math.abs(ahead.x)).toBeLessThan(1e-9);
    expect(right.x).toBeGreaterThan(0);
    expect(behind.y).toBeLessThan(0);
  });

  it('遠い物ほど中心から離れ、範囲の外はふちに置く', () => {
    const [near, far, outside] = radarBlips(origin, identity, [
      target(0, 0, -1e4),
      target(0, 0, -1e8),
      target(0, 0, -1e13),
    ]);
    expect(far.y).toBeGreaterThan(near.y);
    expect(outside.y).toBeCloseTo(1, 9);
    expect(outside.clamped).toBe(true);
    expect(far.clamped).toBe(false);
  });

  it('自分が向きを変えると、レーダーの中の位置も回る（右を向くと、前にあった物は左へ）', () => {
    // y 軸まわりに −90 度（右を向く）
    const s = Math.SQRT1_2;
    const turnedRight: Quat = { x: 0, y: -s, z: 0, w: s };
    const [b] = radarBlips(origin, turnedRight, [target(0, 0, -1e6)]);
    expect(b.x).toBeLessThan(0);
    expect(Math.abs(b.y)).toBeLessThan(1e-9);
  });

  it('上にある物は above、下にある物は above でない', () => {
    const [up, down] = radarBlips(origin, identity, [target(0, 1e6, -1e6), target(0, -1e6, -1e6)]);
    expect(up.above).toBe(true);
    expect(down.above).toBe(false);
  });
});

describe('レーダーの名前', () => {
  it('重なる名前は、優先の高い方だけ出す', () => {
    const got = chooseRadarLabels(
      [
        { id: 'far', x: 0.1, y: 0.1, label: 'メティス', priority: 2 },
        { id: 'near', x: 0.1, y: 0.12, label: 'アドラステア', priority: 1 },
        { id: 'other', x: -0.6, y: -0.5, label: '木星', priority: 3 },
      ],
      5,
    );
    expect([...got].sort()).toEqual(['near', 'other']);
  });

  it('ほかの点の印にかかる名前は出さない', () => {
    const c = { id: 'a', x: 0, y: 0, label: 'イオ', priority: 0 };
    expect(chooseRadarLabels([c], 5, [{ x: 0, y: 0 }]).size).toBe(1);
    expect(chooseRadarLabels([c], 5, [{ x: 0, y: 0 }, { x: 0.12, y: 0.01 }]).size).toBe(0);
  });

  it('数の上限を守り、円の外にはみ出す名前は出さない', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `b${i}`, x: -0.8, y: -0.9 + i * 0.18, label: 'あ', priority: i }));
    expect(chooseRadarLabels(many, 4).size).toBe(4);
    expect(chooseRadarLabels([{ id: 'edge', x: 0.95, y: 0, label: 'とても長い名前', priority: 0 }], 4).size).toBe(0);
  });
});
