import { describe, expect, it } from 'vitest';
import { speedFraction, speedSteps, SPEED_PX_PER_STEP, stickKeys, stickKnob } from './touch-stick';

const keys = (x: number, y: number) => [...stickKeys(x, y)].sort();

describe('stickKeys（バーチャルパッド）', () => {
  it('真ん中のあたりでは動かない', () => {
    expect(keys(0, 0)).toEqual([]);
    expect(keys(0.1, -0.1)).toEqual([]);
  });
  it('上は前、下は後ろ、右は右、左は左', () => {
    expect(keys(0, -0.6)).toEqual(['KeyW']);
    expect(keys(0, 0.6)).toEqual(['KeyS']);
    expect(keys(0.6, 0)).toEqual(['KeyD']);
    expect(keys(-0.6, 0)).toEqual(['KeyA']);
  });
  it('斜めは 2 つのキー', () => {
    expect(keys(0.5, -0.5)).toEqual(['KeyD', 'KeyW']);
    expect(keys(-0.5, 0.5)).toEqual(['KeyA', 'KeyS']);
  });
  it('前へ端まで倒すとダッシュ。後ろへ倒してもダッシュにはならない', () => {
    expect(keys(0, -1)).toEqual(['ControlLeft', 'KeyW']);
    expect(keys(0, -0.8)).toEqual(['KeyW']);
    expect(keys(0, 1)).toEqual(['KeyS']);
  });
});

describe('stickKnob', () => {
  it('半径より外へは出さない', () => {
    expect(stickKnob(0.3, 0.4)).toEqual({ x: 0.3, y: 0.4 });
    const k = stickKnob(3, 4);
    expect(k.x).toBeCloseTo(0.6, 9);
    expect(k.y).toBeCloseTo(0.8, 9);
  });
});

describe('speedSteps・speedFraction（速さのバー）', () => {
  it('上へ動かすと速く、下へ動かすと遅く。余りは次に持ち越す', () => {
    expect(speedSteps(0, -SPEED_PX_PER_STEP * 3)).toEqual({ steps: 3, carryPx: 0 });
    expect(speedSteps(0, SPEED_PX_PER_STEP * 2)).toEqual({ steps: -2, carryPx: 0 });
    const a = speedSteps(0, -5);
    expect(a.steps).toBe(0);
    expect(speedSteps(a.carryPx, -5).steps).toBe(1);
  });
  it('つまみの位置は、下限で 0・上限で 1・その間は対数', () => {
    expect(speedFraction(1, 1, 100)).toBe(0);
    expect(speedFraction(100, 1, 100)).toBe(1);
    expect(speedFraction(10, 1, 100)).toBeCloseTo(0.5, 9);
    expect(speedFraction(1e9, 1, 100)).toBe(1);
  });
});
