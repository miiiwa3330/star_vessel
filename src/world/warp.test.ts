import { describe, expect, it } from 'vitest';
import { arriveAt, createWarpHere, isWarpHole, warpPositionKm, WARP_STANDOFF_KM } from './warp';
import { absolutePositionKm, type Observer } from './observer';
import { heliocentricPositionKm } from './solar-system';
import { minAltitudeKm } from './collision';
import { length, sub } from './vec';

const now = new Date('2026-11-05T00:00:00Z');
const later = new Date('2026-12-01T00:00:00Z');
const nearMars: Observer = { anchor: 'Mars', offsetKm: { x: 10_000, y: 0, z: 0 } };
const forwardY = { x: 0, y: 1, z: 0 };
const make = (o: Observer, existing: Parameters<typeof createWarpHere>[4] = [], id = 'w1') =>
  createWarpHere(o, forwardY, now, 'me', existing, id, now);

describe('createWarpHere', () => {
  it('自分の前方 WARP_STANDOFF_KM に置かれる', () => {
    const w = make(nearMars);
    const d = length(sub(warpPositionKm(w, now), absolutePositionKm(nearMars, now)));
    expect(d).toBeCloseTo(WARP_STANDOFF_KM, 6);
    expect(w.offsetKm.y).toBeCloseTo(WARP_STANDOFF_KM, 6);
  });

  it('ワープすると、置いた人が立っていた位置（輪の正面）に出る', () => {
    const w = make(nearMars);
    const arrived = absolutePositionKm(arriveAt(w), later);
    const placedFrom = absolutePositionKm(nearMars, later);
    expect(length(sub(arrived, placedFrom))).toBeLessThan(1e-6);
  });

  it('天体の近くのワープホールは、天体と一緒に動く', () => {
    const w = make(nearMars);
    expect(length(sub(warpPositionKm(w, later), warpPositionKm(w, now)))).toBeGreaterThan(1e6);
  });

  it('前方が天体にふさがれていても、天体の中には置かない', () => {
    // 地球の表面 150 km の高さで、真下（地球の中心の方）を向いている
    const low: Observer = { anchor: 'Earth', offsetKm: { x: 6_371 + 150, y: 0, z: 0 } };
    const w = createWarpHere(low, { x: -1, y: 0, z: 0 }, now, 'me', [], 'w1', now);
    const altitude = length(sub(warpPositionKm(w, now), heliocentricPositionKm('Earth', now))) - 6_371;
    expect(altitude).toBeGreaterThanOrEqual(minAltitudeKm(6_371) - 1e-6);
  });

  it('名前は「天体の近く 番号」で、同じ天体のワープホールの数で番号が増える', () => {
    const first = make(nearMars);
    const second = make(nearMars, [first], 'w2');
    expect(first.name).toBe('火星の近く 1');
    expect(second.name).toBe('火星の近く 2');
  });

  it('置いたあとに自分が動いても、ワープホールは動かない', () => {
    const o: Observer = { anchor: 'Earth', offsetKm: { x: 20_000, y: 0, z: 0 } };
    const w = make(o);
    o.offsetKm.x = 999;
    expect(w.offsetKm.x).toBe(20_000);
  });
});

describe('isWarpHole', () => {
  it('正しい形だけを受け付ける', () => {
    expect(isWarpHole(make(nearMars))).toBe(true);
    expect(isWarpHole({ ...make(nearMars), facing: { x: 0, y: 0, z: 0 } })).toBe(false);
    expect(isWarpHole({ id: 'x' })).toBe(false);
    expect(isWarpHole(null)).toBe(false);
  });
});
