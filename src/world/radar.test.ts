import { describe, expect, it } from 'vitest';
import { radarBlips, type RadarTarget } from './radar';
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
