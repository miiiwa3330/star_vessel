import { describe, expect, it } from 'vitest';
import {
  DOUBLE_TAP_MS,
  HORIZONTAL_TAU_S,
  VERTICAL_TAU_S,
  approachVelocity,
  isDoubleTap,
  moveInput,
  nextSprint,
  settle,
  verticalInput,
} from './movement';

const keys = (...codes: string[]) => new Set(codes);

describe('キーの割り当て（マインクラフトと同じ）', () => {
  it('Space で上昇、Shift で下降、両方で打ち消す', () => {
    expect(verticalInput(keys('Space'))).toBe(1);
    expect(verticalInput(keys('ShiftLeft'))).toBe(-1);
    expect(verticalInput(keys('ShiftRight'))).toBe(-1);
    expect(verticalInput(keys('Space', 'ShiftLeft'))).toBe(0);
    expect(verticalInput(keys())).toBe(0);
  });

  it('W/S で前後、A/D で左右', () => {
    expect(moveInput(keys('KeyW', 'KeyD'))).toEqual({ forward: 1, right: 1, up: 0 });
    expect(moveInput(keys('KeyS', 'KeyA', 'Space'))).toEqual({ forward: -1, right: -1, up: 1 });
    expect(moveInput(keys('KeyW', 'KeyS'))).toEqual({ forward: 0, right: 0, up: 0 });
  });
});

describe('ダッシュ', () => {
  const fwd = { forward: 1, right: 0, up: 0 };
  const none = { forward: 0, right: 0, up: 0 };
  it('W の 2 回押しか Ctrl で始まり、前へ進むのをやめるまで続く', () => {
    expect(nextSprint(false, fwd, false, false)).toBe(false);
    expect(nextSprint(false, fwd, true, false)).toBe(true);
    expect(nextSprint(false, fwd, false, true)).toBe(true);
    expect(nextSprint(true, fwd, false, false)).toBe(true);
    expect(nextSprint(true, none, true, false)).toBe(false);
    expect(nextSprint(false, { forward: -1, right: 0, up: 0 }, true, false)).toBe(false);
  });

  it('2 回押しは 0.35 秒以内', () => {
    expect(isDoubleTap(1000, 1000 + DOUBLE_TAP_MS)).toBe(true);
    expect(isDoubleTap(1000, 1001 + DOUBLE_TAP_MS)).toBe(false);
    expect(isDoubleTap(-Infinity, 1000)).toBe(false);
  });
});

describe('慣性', () => {
  const up = { x: 0, y: 0, z: 1 };
  const zero = { x: 0, y: 0, z: 0 };

  it('キーを離すと、前後左右は約 0.53 秒で 1/e に減り、上下はもっと早く減る', () => {
    const h = approachVelocity({ x: 100, y: 0, z: 0 }, zero, up, HORIZONTAL_TAU_S);
    expect(h.x).toBeCloseTo(100 / Math.E, 9);
    const v = approachVelocity({ x: 0, y: 0, z: 100 }, zero, up, VERTICAL_TAU_S);
    expect(v.z).toBeCloseTo(100 / Math.E, 9);
    const both = approachVelocity({ x: 100, y: 0, z: 100 }, zero, up, 0.2);
    expect(both.z).toBeLessThan(both.x);
  });

  it('押し続けると、目標の速さに近づき、超えない', () => {
    let vel = zero;
    const target = { x: 0, y: 500, z: 0 };
    for (let i = 0; i < 300; i++) {
      vel = approachVelocity(vel, target, up, 1 / 60);
      expect(vel.y).toBeLessThanOrEqual(500);
    }
    expect(vel.y).toBeCloseTo(500, 1);
  });

  it('小さい dt を何回も足しても、大きい dt 1 回と同じ（フレームの速さに左右されない）', () => {
    let a = { x: 300, y: -40, z: 70 };
    for (let i = 0; i < 10; i++) a = approachVelocity(a, zero, up, 0.01);
    const b = approachVelocity({ x: 300, y: -40, z: 70 }, zero, up, 0.1);
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.z).toBeCloseTo(b.z, 9);
  });

  it('止まろうとしていて十分遅くなったら、ちょうど止める', () => {
    expect(settle({ x: 0.001, y: 0, z: 0 }, zero, 0.01)).toEqual(zero);
    expect(settle({ x: 1, y: 0, z: 0 }, zero, 0.01)).toEqual({ x: 1, y: 0, z: 0 });
    expect(settle({ x: 0.001, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 0.01)).toEqual({ x: 0.001, y: 0, z: 0 });
  });
});
