import { describe, expect, it } from 'vitest';
import { arriveAt, planWarpHere, warpPositionKm, WARP_STANDOFF_KM } from './warp';
import { isWarpHole, isWarpPlacement } from './warp-schema';
import { absolutePositionKm, type Observer } from './observer';
import { heliocentricPositionKm } from './solar-system';
import { minAltitudeKm } from './collision';
import { length, sub } from './vec';

const now = new Date('2026-11-05T00:00:00Z');
const later = new Date('2026-12-01T00:00:00Z');
const nearMars: Observer = { anchor: 'Mars', offsetKm: { x: 10_000, y: 0, z: 0 } };
const forwardY = { x: 0, y: 1, z: 0 };
const sol = () => 'SOL';
const plan = (o: Observer, forward = forwardY) => planWarpHere(o, forward, now, sol);

describe('planWarpHere', () => {
  it('自分の前方 WARP_STANDOFF_KM に置かれる', () => {
    const p = plan(nearMars);
    const d = length(sub(warpPositionKm(p, now), absolutePositionKm(nearMars, now)));
    expect(d).toBeCloseTo(WARP_STANDOFF_KM, 6);
  });

  it('ワープすると、置いた人が立っていた位置（輪の正面）に出る', () => {
    const p = plan(nearMars);
    const d = length(sub(absolutePositionKm(arriveAt(p), later), absolutePositionKm(nearMars, later)));
    expect(d).toBeLessThan(1e-6);
  });

  it('天体の近くのワープホールは、天体と一緒に動く', () => {
    const p = plan(nearMars);
    expect(length(sub(warpPositionKm(p, later), warpPositionKm(p, now)))).toBeGreaterThan(1e6);
  });

  it('前方が天体にふさがれていても、天体の中には置かない', () => {
    const low: Observer = { anchor: 'Earth', offsetKm: { x: 6_371 + 150, y: 0, z: 0 } };
    const p = plan(low, { x: -1, y: 0, z: 0 });
    const altitude = length(sub(warpPositionKm(p, now), heliocentricPositionKm('Earth', now))) - 6_371;
    expect(altitude).toBeGreaterThanOrEqual(minAltitudeKm(6_371) - 1e-6);
  });

  it('恒星系の記号は、置く場所の位置から決める', () => {
    let asked: unknown = null;
    planWarpHere(nearMars, forwardY, now, (pos) => {
      asked = pos;
      return 'SOL';
    });
    expect(length(sub(asked as never, warpPositionKm(plan(nearMars), now)))).toBeLessThan(1e-6);
  });

  it('置く場所は、サーバーが受け付ける形になっている', () => {
    expect(isWarpPlacement(plan(nearMars))).toBe(true);
  });
});

describe('isWarpPlacement', () => {
  const ok = plan(nearMars);
  it('正しくない置き場所は受け付けない', () => {
    expect(isWarpPlacement({ ...ok, anchor: 'Vulcan' })).toBe(false);
    expect(isWarpPlacement({ ...ok, facing: { x: 0, y: 0, z: 0 } })).toBe(false);
    expect(isWarpPlacement({ ...ok, offsetKm: { x: Number.NaN, y: 0, z: 0 } })).toBe(false);
    expect(isWarpPlacement({ ...ok, system: 'H32263' })).toBe(false); // 火星を基準にしたまま、ほかの恒星系
    expect(isWarpPlacement({ ...ok, anchor: 'Sun', system: 'H32263' })).toBe(true);
    expect(isWarpPlacement(null)).toBe(false);
  });
});

describe('isWarpHole', () => {
  it('サーバーの返すワープホールの形だけを受け付ける', () => {
    const w = { ...plan(nearMars), id: 'a', code: 'MW-ORI-SOL-4-0-001', createdAt: now.toISOString(), mine: true };
    expect(isWarpHole(w)).toBe(true);
    expect(isWarpHole({ ...w, mine: undefined })).toBe(false);
  });
});
