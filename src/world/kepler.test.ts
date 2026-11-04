import { describe, expect, it } from 'vitest';
import {
  axisKmFromPeriod,
  keplerPositionKm,
  meanAnomalyFromTrue,
  periodDaysFromAxis,
  solveKepler,
  type KeplerElements,
} from './kepler';
import { KM_PER_AU } from './units';
import { length } from './vec';

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
const base: KeplerElements = {
  aKm: KM_PER_AU,
  e: 0,
  iRad: 0,
  nodeRad: 0,
  periRad: 0,
  meanAnomalyRad: 0,
  epochMs: 0,
  periodDays: 100,
  frame: IDENTITY,
};

describe('solveKepler', () => {
  it('解いた E はケプラーの方程式を満たす', () => {
    for (const e of [0, 0.1, 0.5, 0.9, 0.97]) {
      for (const M of [0.1, 1, 2.5, 4, 6]) {
        const E = solveKepler(M, e);
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 10);
      }
    }
  });
});

describe('keplerPositionKm', () => {
  it('円の軌道では距離が一定で、半周期で反対側に行く', () => {
    const p0 = keplerPositionKm(base, new Date(0));
    const p1 = keplerPositionKm(base, new Date(50 * 86_400_000));
    expect(length(p0)).toBeCloseTo(KM_PER_AU, 0);
    expect(p0.x).toBeCloseTo(KM_PER_AU, 0);
    expect(p1.x).toBeCloseTo(-KM_PER_AU, 0);
  });

  it('楕円の軌道では、近点で a(1−e)・遠点で a(1+e)', () => {
    const el = { ...base, e: 0.5 };
    expect(length(keplerPositionKm(el, new Date(0)))).toBeCloseTo(KM_PER_AU * 0.5, 0);
    expect(length(keplerPositionKm(el, new Date(50 * 86_400_000)))).toBeCloseTo(KM_PER_AU * 1.5, 0);
  });

  it('真近点角から平均近点角を出すと、その位置に来る', () => {
    const e = 0.3;
    const f = 1.2;
    const el = { ...base, e, meanAnomalyRad: meanAnomalyFromTrue(f, e) };
    const p = keplerPositionKm(el, new Date(0));
    expect(Math.atan2(p.y, p.x)).toBeCloseTo(f, 9);
  });
});

describe('第 3 法則', () => {
  it('太陽のまわり 1 天文単位の周期は約 365.25 日', () => {
    expect(periodDaysFromAxis(KM_PER_AU, 1)).toBeCloseTo(365.25, 0);
    expect(axisKmFromPeriod(365.256, 1) / KM_PER_AU).toBeCloseTo(1, 3);
  });
});
