import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { activeComets, cometBody, cometPositionKm, decodeComets, tailLengthKm } from './comets';
import { bodyAddress } from './address';
import { KM_PER_AU } from './units';

const comets = decodeComets(JSON.parse(readFileSync('public/data/comets.json', 'utf8')));
const byCode = (code: string) => comets.find((c) => c.code === code)!;
const DATE = new Date(Date.UTC(2026, 10, 5));
const dist = (p: { x: number; y: number; z: number }, q: readonly [number, number, number]) => Math.hypot(p.x - q[0], p.y - q[1], p.z - q[2]);

describe('彗星（要件 F41）', () => {
  it('JPL Horizons の位置と合う（2026-11-05 00:00 TDB。Horizons の値は 2026-11-05 に取得）', () => {
    const cases: [string, [number, number, number]][] = [
      // 周期彗星（楕円）
      ['C1P', [-2.89270915294097e9, 4.356789385106151e9, 2.829387112540165e8]],
      ['C2P', [2.442265954759945e8, 7.093344552683572e7, 7.263360800529355e7]],
      // 恒星間天体（双曲線）
      ['C2I', [8.934671263559605e7, -4.351541099034485e9, -5.952646064511099e9]],
      ['C3I', [-4.006382443263378e8, 1.787732209006151e9, 6.590203863777204e8]],
    ];
    for (const [code, want] of cases) {
      const c = byCode(code);
      const p = cometPositionKm(c, DATE);
      // 元期からの惑星の引力でずれるので、太陽からの距離の 2% までを許す
      expect(dist(p, want), code).toBeLessThan(0.02 * Math.hypot(...want));
    }
  });

  it('消滅した彗星は入れない。記号は住所に使える', () => {
    expect(comets.some((c) => c.name.includes('3D/Biela'))).toBe(false);
    expect(comets.every((c) => bodyAddress(c.code)?.planet === c.code)).toBe(true);
    expect(new Set(comets.map((c) => c.code)).size).toBe(comets.length);
  });

  it('どの彗星の位置も数になる（楕円・放物線・双曲線）', () => {
    for (const c of comets) {
      const p = cometPositionKm(c, DATE);
      expect(Number.isFinite(p.x + p.y + p.z), c.code).toBe(true);
    }
    expect(comets.some((c) => c.e === 1)).toBe(true);
    expect(comets.some((c) => c.e > 1)).toBe(true);
  });

  it('尾は太陽に近いほど長く、4 AU より遠いと無い', () => {
    expect(tailLengthKm({ m1: 8 }, 5 * KM_PER_AU)).toBe(0);
    expect(tailLengthKm({ m1: 8 }, 0.5 * KM_PER_AU)).toBeGreaterThan(tailLengthKm({ m1: 8 }, 2 * KM_PER_AU));
  });

  it('太陽の近くの彗星と自分の近くの彗星を選び、天体の形にする', () => {
    const halley = byCode('C1P');
    const list = activeComets(comets, DATE, cometPositionKm(halley, DATE), 1e6, 10);
    expect(list[0].code).toBe('C1P');
    expect(list.length).toBeLessThanOrEqual(10);
    const b = cometBody(halley);
    expect(b.nameJa).toBe('ハレー彗星');
    expect(b.kind).toBe('comet');
  });
});
