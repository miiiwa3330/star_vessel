import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bodyAddress } from './address';
import { spacecraftPositionKm, type SpacecraftRecord } from './spacecraft';

const list = (JSON.parse(readFileSync('public/data/spacecraft.json', 'utf8')) as { spacecraft: SpacecraftRecord[] }).spacecraft;
const DATE = new Date(Date.UTC(2026, 10, 5));
const dist = (p: { x: number; y: number; z: number }, q: readonly [number, number, number]) => Math.hypot(p.x - q[0], p.y - q[1], p.z - q[2]);

describe('探査機（要件 F42）', () => {
  it('表の間でも JPL Horizons の位置と合う（2026-11-05 00:00 TDB）', () => {
    // 表は 2026-10-01 から。ボイジャーは 30 日ごと、ウェッブは 5 日ごと。補間した位置を比べる
    const v1 = list.find((s) => s.id === 'V31')!;
    expect(dist(spacecraftPositionKm(v1, DATE), [-4.817778633383684e9, -2.472009800812699e10, 5.456365015698077e9])).toBeLessThan(3_000);
    const jwst = list.find((s) => s.id === 'V170')!;
    expect(dist(spacecraftPositionKm(jwst, DATE), [1.104149151445293e8, 9.290449571156386e7, 4.011446416729786e7])).toBeLessThan(30_000);
  });

  it('表の期間の外でも位置が出る', () => {
    const v1 = list.find((s) => s.id === 'V31')!;
    const far = spacecraftPositionKm(v1, new Date(Date.UTC(2040, 0, 1)));
    expect(Number.isFinite(far.x + far.y + far.z)).toBe(true);
  });

  it('id は住所に使える（惑星・衛星とも 0）', () => {
    for (const s of list) expect(bodyAddress(s.id)).toEqual({ planet: '0', moon: 0, system: 'SOL' });
  });
});
