import { describe, expect, it } from 'vitest';
import {
  SCAN_IDLE,
  SCAN_MS,
  SCAN_RESULT_MS,
  angleDeg,
  inScanRange,
  markAlready,
  nearestScannable,
  scanArc,
  scanProgress,
  scanRangeKm,
  startScan,
  stepScan,
} from './scan';
import { length, sub } from './vec';

const origin = { x: 0, y: 0, z: 0 };
const fwd = { x: 1, y: 0, z: 0 };

describe('スキャンできる範囲', () => {
  it('距離は大きさに比例し、地球は 3 万 km まで', () => {
    expect(scanRangeKm(6371)).toBeCloseTo(30_000, 6);
    // 月（半径 1,737 km）は約 8,200 km、太陽（69.6 万 km）は約 328 万 km
    expect(scanRangeKm(1737)).toBeCloseTo(8_179, 0);
    expect(scanRangeKm(695_700)).toBeCloseTo(3_275_939, -1);
    // どの大きさでも、範囲のふちで見える大きさ（半径 / 距離）は同じ
    expect(1 / scanRangeKm(1)).toBeCloseTo(6371 / scanRangeKm(6371), 12);
  });

  it('半径の分からないもの（星団など）はスキャンしない', () => {
    expect(inScanRange({ positionKm: { x: 10, y: 0, z: 0 } }, origin)).toBe(false);
    expect(inScanRange({ positionKm: { x: 10, y: 0, z: 0 }, radiusKm: 0 }, origin)).toBe(false);
  });

  it('範囲の内と外', () => {
    expect(inScanRange({ positionKm: { x: 29_900, y: 0, z: 0 }, radiusKm: 6371 }, origin)).toBe(true);
    expect(inScanRange({ positionKm: { x: 30_100, y: 0, z: 0 }, radiusKm: 6371 }, origin)).toBe(false);
  });

  it('範囲にあるもののうち、表面がいちばん近いものを選ぶ', () => {
    const big = { key: 'big', positionKm: { x: 20_000, y: 0, z: 0 }, radiusKm: 10_000 }; // 表面まで 10,000 km（範囲は約 4.7 万 km）
    const small = { key: 'small', positionKm: { x: 0, y: 3, z: 0 }, radiusKm: 1 }; // 表面まで 2 km（範囲は約 4.7 km）
    const far = { key: 'far', positionKm: { x: 0, y: 0, z: 1e9 }, radiusKm: 1 };
    expect(nearestScannable([big, small, far], origin)?.key).toBe('small');
    expect(nearestScannable([far], origin)).toBeNull();
  });
});

describe('スキャンの進み方', () => {
  const start = startScan(SCAN_IDLE, 'Earth', 1000, fwd, 'third');
  const input = (nowMs: number, over: Partial<Parameters<typeof stepScan>[1]> = {}) => ({ nowMs, forward: fwd, view: 'third', inRange: true, ...over });

  it('時間がたつと成功し、しばらくして元に戻る', () => {
    expect(scanProgress(start, 1000 + SCAN_MS / 2)).toBeCloseTo(0.5);
    expect(stepScan(start, input(1000 + SCAN_MS - 1)).event).toBeNull();
    const done = stepScan(start, input(1000 + SCAN_MS));
    expect(done.event).toBe('success');
    expect(done.state.phase).toBe('success');
    expect(stepScan(done.state, input(1000 + SCAN_MS + SCAN_RESULT_MS - 1)).state.phase).toBe('success');
    expect(stepScan(done.state, input(1000 + SCAN_MS + SCAN_RESULT_MS)).state.phase).toBe('idle');
  });

  it('向きを少し揺らしても続く（2 度まで）', () => {
    const f = { x: 1, y: Math.tan((1.5 * Math.PI) / 180), z: 0 };
    expect(stepScan(start, input(1500, { forward: f })).event).toBeNull();
  });

  it('向きを変える・視点を切り替える・範囲の外へ出ると失敗', () => {
    const f = { x: 1, y: Math.tan((3 * Math.PI) / 180), z: 0 };
    expect(stepScan(start, input(1500, { forward: f })).event).toBe('failure');
    expect(stepScan(start, input(1500, { view: 'first' })).event).toBe('failure');
    const lost = stepScan(start, input(1500, { inRange: false }));
    expect(lost.event).toBe('failure');
    expect(lost.state.phase).toBe('failure');
  });

  it('もうコレクションにある天体は ALREADY にし、同じ時間で元に戻る', () => {
    const done = stepScan(start, input(1000 + SCAN_MS)).state;
    const already = markAlready(done);
    expect(already.phase).toBe('already');
    expect(stepScan(already, input(1000 + SCAN_MS + SCAN_RESULT_MS - 1)).state.phase).toBe('already');
    expect(stepScan(already, input(1000 + SCAN_MS + SCAN_RESULT_MS)).state.phase).toBe('idle');
    // 終わっていないスキャン・失敗は変えない
    expect(markAlready(start)).toBe(start);
  });

  it('スキャンの最中に押しても、いまのスキャンを続ける', () => {
    expect(startScan(start, 'Moon', 2000, fwd, 'third')).toBe(start);
  });

  it('角度', () => {
    expect(angleDeg(fwd, { x: 0, y: 1, z: 0 })).toBeCloseTo(90);
    expect(angleDeg(fwd, { x: 2, y: 0, z: 0 })).toBeCloseTo(0);
  });
});

describe('スキャンの光の弧', () => {
  const center = { x: 100_000, y: 0, z: 0 };
  const up = { x: 0, y: 0, z: 1 };
  const R = 10_000;

  it('点は表面のすぐ外にあり、UFO から見える側にある', () => {
    for (const p of [0, 0.3, 0.5, 0.9]) {
      const arc = scanArc(origin, center, R, up, p, 16);
      expect(arc.length).toBe(16);
      for (const q of arc) {
        expect(length(sub(q, center))).toBeCloseTo(R * 1.004, 3);
        // 縁の向こう（天体に隠れる側）ではない
        const toObs = sub(origin, center);
        const rel = sub(q, center);
        const along = (rel.x * toObs.x + rel.y * toObs.y + rel.z * toObs.z) / length(toObs);
        expect(along).toBeGreaterThanOrEqual((R * R) / length(toObs) - 1e-6);
      }
    }
  });

  it('上から下へ動く', () => {
    const top = scanArc(origin, center, R, up, 0.1, 9)[4];
    const mid = scanArc(origin, center, R, up, 0.5, 9)[4];
    const bottom = scanArc(origin, center, R, up, 0.9, 9)[4];
    expect(top.z).toBeGreaterThan(mid.z);
    expect(mid.z).toBeCloseTo(0, 6);
    expect(bottom.z).toBeLessThan(mid.z);
  });

  it('天体の中にいる・上の向きが視線と平行でも壊れない', () => {
    expect(scanArc(center, center, R, up, 0.5, 8)).toEqual([]);
    const arc = scanArc(origin, center, R, { x: 1, y: 0, z: 0 }, 0.5, 8);
    expect(arc.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z))).toBe(true);
  });
});
