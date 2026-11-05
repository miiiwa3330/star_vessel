import { describe, expect, it } from 'vitest';
import { ClockSync } from './clock';

/** 届くまでの時間が毎回変わるメッセージを、1 秒に 4 通受け取りながら、60 fps で時刻を読む */
function run(trueOffsetMs: number, latencies: readonly number[], frames: number) {
  const c = new ClockSync();
  const out: { local: number; world: number }[] = [];
  let local = 1_000_000;
  let next = 0;
  let sent = 0;
  for (let f = 0; f < frames; f++) {
    local += 1000 / 60;
    if (local >= next) {
      const latency = latencies[sent++ % latencies.length];
      c.report(local + trueOffsetMs - latency, local);
      next = local + 250;
    }
    out.push({ local, world: c.now(local) });
  }
  return out;
}

describe('ClockSync', () => {
  it('届くまでの時間が大きく変わっても、時刻は戻らず、進み方は 5% しか変わらない', () => {
    const r = run(0, [1, 422, 30, 5, 180, 2, 90], 60 * 30);
    for (let i = 1; i < r.length; i++) {
      const dLocal = r[i].local - r[i - 1].local;
      const dWorld = r[i].world - r[i - 1].world;
      expect(dWorld).toBeGreaterThanOrEqual(dLocal * 0.949);
      expect(dWorld).toBeLessThanOrEqual(dLocal * 1.051);
    }
  });

  it('いちばん早く届いた値に合わせる（遅れて届いた値に引きずられない）', () => {
    const r = run(1_000, [40, 300, 25, 120], 60 * 40);
    const last = r[r.length - 1];
    expect(last.world - last.local).toBeCloseTo(1_000 - 25, 6);
  });

  it('大きくずれた端末の時計は、一度で合わせる', () => {
    const c = new ClockSync();
    c.now(0);
    c.report(60_000 + 16, 16);
    expect(c.now(16)).toBe(60_016);
  });

  it('サーバーの値が届く前は、端末の時計のまま', () => {
    const c = new ClockSync();
    expect(c.now(123)).toBe(123);
    expect(c.now(456)).toBe(456);
  });
});
