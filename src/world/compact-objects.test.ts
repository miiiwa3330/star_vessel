import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeCompact, schwarzschildKm } from './compact-objects';
import { COMPACT_FRACTIONS, COMPACT_INDEX_BASE, generateCell, galactoToEqjPc, cellOf, parseGeneratedSystem } from './galaxy';
import { isSystemCode } from './address';
import { systemBodies } from './planets';

const compact = decodeCompact(JSON.parse(readFileSync('public/data/compact.json', 'utf8')));

describe('星の燃えかす（実在）', () => {
  it('白色矮星・パルサー・ブラックホールがあり、記号は住所に使える形', () => {
    for (const kind of ['white-dwarf', 'neutron-star', 'black-hole'] as const) {
      expect(compact.filter((c) => c.kind === kind).length).toBeGreaterThan(10);
    }
    expect(compact.every((c) => isSystemCode(c.code))).toBe(true);
    const crab = compact.find((c) => c.code === 'P0534P2200')!;
    expect(crab.periodS).toBeCloseTo(0.0334, 3);
  });

  it('燃えかすの恒星系は、それ 1 つだけ（惑星は作らない）', () => {
    const crab = compact.find((c) => c.code === 'P0534P2200')!;
    const bodies = systemBodies(
      { system: crab.code, positionPc: crab.positionPc, absMag: crab.absMag, bv: crab.bv, compact: 'neutron-star', compactInfo: { name: crab.name, periodS: crab.periodS } },
      null,
    );
    expect(bodies).toHaveLength(1);
    expect(bodies[0].radiusKm).toBe(12);
    expect(bodies[0].compact?.beamPeriodS).toBe(1);
  });

  it('シュワルツシルト半径は太陽質量あたり約 2.95 km', () => {
    expect(schwarzschildKm(10)).toBeCloseTo(29.5, 0);
  });
});

describe('星の燃えかす（自動で作る）', () => {
  it('ふつうの星とは別に、番号 1000 から作られ、割合はおよそ観測どおり', () => {
    let stars = 0;
    const counts = { 'white-dwarf': 0, 'neutron-star': 0, 'black-hole': 0 };
    for (let i = 0; i < 400; i++) {
      for (const s of generateCell(cellOf(galactoToEqjPc({ x: -4 - i * 0.03, y: 0.5, z: 0 })))) {
        if (s.compact) {
          counts[s.compact]++;
          expect(parseGeneratedSystem(s.system)!.index).toBeGreaterThanOrEqual(COMPACT_INDEX_BASE);
        } else stars++;
      }
    }
    expect(counts['white-dwarf'] / stars).toBeCloseTo(COMPACT_FRACTIONS['white-dwarf'], 1);
    expect(counts['neutron-star']).toBeGreaterThan(0);
  });
});
