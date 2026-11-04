import { describe, expect, it } from 'vitest';
import { absolutePositionKm, reanchor, startObserver, type Observer } from './observer';
import { heliocentricPositionKm } from './solar-system';
import { length, sub } from './vec';

const date = new Date('2026-11-04T12:00:00Z');

describe('reanchor', () => {
  it('基準の天体を選び直しても、位置そのものは変わらない', () => {
    const moon = heliocentricPositionKm('Moon', date);
    const earth = heliocentricPositionKm('Earth', date);
    // 地球を基準にしたまま、月のすぐそばにいる
    const o: Observer = { anchor: 'Earth', offsetKm: sub({ x: moon.x + 5_000, y: moon.y, z: moon.z }, earth) };
    const r = reanchor(o, date);
    expect(r.anchor).toBe('Moon');
    expect(length(sub(absolutePositionKm(r, date), absolutePositionKm(o, date)))).toBeLessThan(1e-3);
  });

  it('どの惑星の影響圏にもいなければ、太陽を基準にする', () => {
    const o: Observer = { anchor: 'Earth', offsetKm: { x: 5e6, y: 0, z: 0 } };
    expect(reanchor(o, date).anchor).toBe('Sun');
  });

  it('地球の近くでは地球を基準にする', () => {
    expect(reanchor(startObserver(date), date).anchor).toBe('Earth');
  });
});

describe('startObserver', () => {
  it('地球の中心から 2 万 km、太陽の側に出発する', () => {
    const o = startObserver(date);
    expect(length(o.offsetKm)).toBeCloseTo(20_000, 6);
    const toSun = sub({ x: 0, y: 0, z: 0 }, heliocentricPositionKm('Earth', date));
    const dot = o.offsetKm.x * toSun.x + o.offsetKm.y * toSun.y + o.offsetKm.z * toSun.z;
    expect(dot).toBeGreaterThan(0);
  });
});
