import { describe, expect, it } from 'vitest';
import { FLY_IN_MS, FLY_OUT_MS, flyOutStartMs, loadingMotion, MIN_MS, usableStart } from './loading-timing';

const doneAt = (readyMs: number): number => {
  for (let t = 0; t < 60_000; t += 5) if (loadingMotion(t, readyMs).done) return t;
  return Infinity;
};

describe('loadingMotion（タイトル画面の船と同じ飛び方）', () => {
  it('左の端の外から飛んできて、真ん中で止まる（はじめが速く、だんだん遅く）', () => {
    expect(loadingMotion(0, null).x).toBeCloseTo(-1, 2);
    expect(loadingMotion(0, null).speed).toBeCloseTo(1, 6);
    const a = loadingMotion(200, null);
    const b = loadingMotion(600, null);
    expect(a.x).toBeLessThan(b.x);
    expect(a.speed).toBeGreaterThan(b.speed);
    expect(loadingMotion(FLY_IN_MS + 10, null)).toEqual({ x: 0, speed: 0, done: false });
  });
  it('準備ができるまでは、真ん中で待つ', () => {
    expect(loadingMotion(10_000, null)).toEqual({ x: 0, speed: 0, done: false });
  });
  it('準備が 0.5 秒でできても、2 秒で右の端の外へ出る', () => {
    expect(flyOutStartMs(500)).toBe(MIN_MS - FLY_OUT_MS);
    expect(doneAt(500)).toBe(MIN_MS);
    expect(doneAt(0)).toBe(MIN_MS);
  });
  it('準備が遅いときは、準備ができてから 0.7 秒で出る。飛び去るときは、ゆっくり動き出して加速する', () => {
    expect(doneAt(5_000)).toBe(5_000 + FLY_OUT_MS);
    const s1 = loadingMotion(5_100, 5_000);
    const s2 = loadingMotion(5_600, 5_000);
    expect(s1.x).toBeGreaterThan(0);
    expect(s2.x).toBeGreaterThan(s1.x);
    expect(s2.speed).toBeGreaterThan(s1.speed);
  });
  it('行き来しない（いつも右へ進むか、止まっている）', () => {
    for (const r of [0, 500, 1500, 4000]) {
      let prev = -2;
      for (let t = 0; t <= doneAt(r); t += 5) {
        const x = loadingMotion(t, r).x;
        expect(x).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = x;
      }
    }
  });
});

describe('usableStart（前のページから引き継ぐか）', () => {
  it('新しいものだけ使う', () => {
    expect(usableStart(1_000, 5_000)).toBe(true);
    expect(usableStart(null, 5_000)).toBe(false);
    expect(usableStart(0, 200_000)).toBe(false);
    expect(usableStart(9_000, 5_000)).toBe(false);
    expect(usableStart(Number.NaN, 5_000)).toBe(false);
  });
});
