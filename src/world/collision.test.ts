import { describe, expect, it } from 'vitest';
import { keepOutsideBodies, minAltitudeKm } from './collision';
import { absolutePositionKm, type Observer } from './observer';
import { heliocentricPositionKm } from './solar-system';
import { length, sub } from './vec';

const date = new Date('2026-11-05T00:00:00Z');
const distanceFrom = (o: Observer, body: 'Earth' | 'Sun') =>
  length(sub(absolutePositionKm(o, date), heliocentricPositionKm(body, date)));

describe('minAltitudeKm', () => {
  it('地球のような小さな天体は 100 km、太陽のような大きな天体は半径の 1%', () => {
    expect(minAltitudeKm(6_371)).toBe(100);
    expect(minAltitudeKm(695_700)).toBeCloseTo(6_957, 6);
  });
});

describe('keepOutsideBodies', () => {
  it('地球の中に入ろうとすると、表面から 100 km の高さに押し戻される', () => {
    const o: Observer = { anchor: 'Earth', offsetKm: { x: 3_000, y: 0, z: 0 } };
    expect(distanceFrom(keepOutsideBodies(o, date), 'Earth')).toBeCloseTo(6_471, 3);
  });

  it('押し戻す向きは、天体の中心から外へ（入ってきた側に戻る）', () => {
    const r = keepOutsideBodies({ anchor: 'Earth', offsetKm: { x: 0, y: -5_000, z: 0 } }, date);
    expect(r.offsetKm.y).toBeLessThan(0);
    expect(Math.abs(r.offsetKm.x)).toBeLessThan(1e-6);
  });

  it('十分に離れていれば、何も変えない', () => {
    const o: Observer = { anchor: 'Earth', offsetKm: { x: 20_000, y: 0, z: 0 } };
    expect(keepOutsideBodies(o, date)).toBe(o);
  });

  it('基準の天体と違う天体（太陽）にも近づけない', () => {
    const o: Observer = { anchor: 'Sun', offsetKm: { x: 100_000, y: 0, z: 0 } };
    expect(distanceFrom(keepOutsideBodies(o, date), 'Sun')).toBeCloseTo(695_700 + 6_957, 3);
  });
});
