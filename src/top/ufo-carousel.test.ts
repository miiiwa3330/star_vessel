import { describe, expect, it } from 'vitest';
import {
  dragPosition,
  flightDuration,
  FLY_IN_MS,
  FLY_OUT_MS,
  FLY_STAGGER_MS,
  flyIn,
  flyOut,
  hullOfTarget,
  indexOfTarget,
  SIDE_SCALE,
  settleTarget,
  slotLook,
  stepSpring,
  targetForIndex,
  ufoFlight,
  wrapOffset,
} from './ufo-carousel';

describe('UFO の列の位置', () => {
  it('真ん中からの距離は、輪の上で近い方の向きに収まる', () => {
    expect(wrapOffset(0)).toBe(0);
    expect(wrapOffset(1)).toBe(1);
    expect(wrapOffset(2)).toBe(-1);
    expect(wrapOffset(-1)).toBe(-1);
    expect(wrapOffset(4)).toBe(1);
    expect(wrapOffset(0.4)).toBeCloseTo(0.4);
    expect(wrapOffset(1.6)).toBeCloseTo(-1.4);
  });

  it('目標の整数から、どの船かが決まる（負の数や、何周していても）', () => {
    expect(indexOfTarget(0)).toBe(0);
    expect(indexOfTarget(3)).toBe(0);
    expect(indexOfTarget(4)).toBe(1);
    expect(indexOfTarget(-1)).toBe(2);
    expect(indexOfTarget(-3)).toBe(0);
    expect(hullOfTarget(1)).toBe('bell');
  });

  it('船を指定して真ん中へ持ってくる目標は、いまの目標に近い方へ回る', () => {
    expect(targetForIndex(0, 0)).toBe(0);
    expect(targetForIndex(1, 0)).toBe(1);
    expect(targetForIndex(2, 0)).toBe(-1); // 2 へ行くより、左へ 1 つ戻る方が近い
    expect(targetForIndex(0, 2)).toBe(3);
    // どの組み合わせでも、目標が指す船は指定した船で、動きは 1 つ以内
    for (let cur = -7; cur <= 7; cur++) {
      for (let i = 0; i < 3; i++) {
        const t = targetForIndex(i, cur);
        expect(indexOfTarget(t)).toBe(i);
        expect(Math.abs(t - cur)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('UFO の大きさ', () => {
  it('真ん中だけ大きく、隣は SIDE_SCALE、さらに外では消える', () => {
    expect(slotLook(0)).toEqual({ scale: 1, alpha: 1 });
    expect(slotLook(1).scale).toBeCloseTo(SIDE_SCALE);
    expect(slotLook(-1).scale).toBeCloseTo(SIDE_SCALE);
    expect(slotLook(1.5).scale).toBeCloseTo(0);
    expect(slotLook(1.5).alpha).toBeCloseTo(0);
    expect(slotLook(-1.5).alpha).toBeCloseTo(0);
  });

  it('離れるほど小さくなる（途中で大きくならない）', () => {
    let prev = Number.POSITIVE_INFINITY;
    for (let a = 0; a <= 1.5; a += 0.05) {
      const s = slotLook(a).scale;
      expect(s).toBeLessThanOrEqual(prev + 1e-9);
      prev = s;
    }
  });

  it('輪の裏側の船が左右で入れ替わる瞬間は、見えない', () => {
    // pos = 0.5 のとき、番号 2 の船は −1.5 にいる
    expect(slotLook(wrapOffset(2 - 0.5)).alpha).toBeCloseTo(0);
  });
});

describe('ばね', () => {
  it('目標に近づき、行き過ぎない', () => {
    let s = { pos: 0, vel: 0 };
    let max = 0;
    for (let i = 0; i < 240; i++) {
      s = stepSpring(s.pos, s.vel, 1, 1 / 60, 11);
      max = Math.max(max, s.pos);
    }
    expect(s.pos).toBeCloseTo(1, 4);
    expect(max).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('フレームの長さが違っても、同じ時間なら同じ位置になる', () => {
    let a = { pos: 0, vel: 0 };
    for (let i = 0; i < 30; i++) a = stepSpring(a.pos, a.vel, 2, 1 / 60, 11);
    const b = stepSpring(0, 0, 2, 0.5, 11);
    expect(a.pos).toBeCloseTo(b.pos, 6);
  });

  it('速さを持っていれば、そのまま目標を通り過ぎる向きに動き出す', () => {
    const s = stepSpring(0, 5, 0, 1 / 60, 11);
    expect(s.pos).toBeGreaterThan(0);
  });
});

describe('ドラッグ', () => {
  it('右へ引くと pos が減る（左隣の船が真ん中へ来る）', () => {
    expect(dragPosition(1, 100, 200)).toBeCloseTo(0.5);
    expect(dragPosition(1, -200, 200)).toBeCloseTo(2);
  });

  it('指を離したとき、勢いがなければ近い船へ。勢いがあれば先まで。ただし始めた位置の隣まで', () => {
    expect(settleTarget(0.4, 0, 0)).toBe(0);
    expect(settleTarget(0.6, 0, 0)).toBe(1);
    expect(settleTarget(0.2, 4, 0)).toBe(1); // 速く左へ送った（pos が増える向き）
    expect(settleTarget(0.2, -4, 0)).toBe(-1);
    expect(settleTarget(0, 100, 0)).toBe(1); // どれだけ速くても 1 つ隣まで
    expect(settleTarget(0, -100, 0)).toBe(-1);
    expect(settleTarget(5.3, 0, 5)).toBe(5);
    // 1.15 個分引いたあとに勢いがあっても、始めた位置（0）の隣（1）まで
    expect(settleTarget(1.15, 12, 0)).toBe(1);
    expect(settleTarget(-1.15, -12, 0)).toBe(-1);
  });
});

describe('出入り', () => {
  it('飛来：右の外から始まり、最初は速く、止まる', () => {
    expect(flyIn(0).offset).toBeCloseTo(1);
    expect(flyIn(0).speed).toBe(1);
    expect(flyIn(1)).toEqual({ offset: 0, speed: 0 });
    // 100 ms（p ≈ 0.09）で、もう距離の半分以上を進んでいる
    expect(flyIn(100 / FLY_IN_MS).offset).toBeLessThan(0.55);
    let prev = 2;
    for (let p = 0; p <= 1; p += 0.02) {
      const o = flyIn(p).offset;
      expect(o).toBeLessThanOrEqual(prev + 1e-9);
      expect(o).toBeGreaterThanOrEqual(-1e-9);
      prev = o;
    }
  });

  it('退場：ゆっくり始まり、左の外へ加速して消える', () => {
    expect(flyOut(0)).toEqual({ offset: 0, speed: 0 });
    expect(flyOut(1).offset).toBeCloseTo(-1);
    expect(flyOut(1).speed).toBeCloseTo(1);
    expect(flyOut(0.5).offset).toBeGreaterThan(-0.05);
    let prev = 1;
    for (let p = 0; p <= 1; p += 0.02) {
      const o = flyOut(p).offset;
      expect(o).toBeLessThanOrEqual(prev + 1e-9);
      prev = o;
    }
  });

  it('範囲の外の p でも壊れない', () => {
    expect(flyIn(-1).offset).toBeCloseTo(1);
    expect(flyIn(5).offset).toBe(0);
    expect(flyOut(-1).offset).toBe(0);
    expect(flyOut(5).offset).toBeCloseTo(-1);
  });

  it('左の船から順に出て、左の船から順に消える', () => {
    // 飛来：順番が来るまでは見えない
    expect(ufoFlight('in', 0, 10).visible).toBe(true);
    expect(ufoFlight('in', 2, 10).visible).toBe(false);
    expect(ufoFlight('in', 2, 2 * FLY_STAGGER_MS + 10).visible).toBe(true);
    // 全部が終わる時間には、全部が元の場所
    const done = flightDuration('in');
    for (const rank of [0, 1, 2]) expect(ufoFlight('in', rank, done).offset).toBe(0);
    // 退場：左の船が先に消える
    expect(ufoFlight('out', 0, FLY_OUT_MS + 1).visible).toBe(false);
    expect(ufoFlight('out', 2, FLY_OUT_MS + 1).visible).toBe(true);
    for (const rank of [0, 1, 2]) expect(ufoFlight('out', rank, flightDuration('out')).visible).toBe(false);
  });

  it('隠れているときは見えず、止まっているときは元の場所', () => {
    expect(ufoFlight('hidden', 0, 0).visible).toBe(false);
    expect(ufoFlight('idle', 1, 0)).toEqual({ offset: 0, speed: 0, visible: true });
  });
});
