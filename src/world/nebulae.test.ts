import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeNebulae, insideOf, nebulaParticles, prominent } from './nebulae';

const nebulae = decodeNebulae(JSON.parse(readFileSync('public/data/nebulae.json', 'utf8')));
const named = (ja: string) => nebulae.find((n) => n.nameJa === ja)!;
const dist = (p: { x: number; y: number; z: number }) => Math.hypot(p.x, p.y, p.z);

describe('星雲（要件 F43）', () => {
  it('よく知られた星雲が、観測の距離（おおよその値）にある', () => {
    expect(dist(named('オリオン大星雲').positionPc)).toBeGreaterThan(350);
    expect(dist(named('オリオン大星雲').positionPc)).toBeLessThan(550);
    expect(dist(named('かに星雲').positionPc)).toBeGreaterThan(1500);
    expect(dist(named('かに星雲').positionPc)).toBeLessThan(2500);
    expect(dist(named('環状星雲').positionPc)).toBeGreaterThan(600);
    expect(dist(named('環状星雲').positionPc)).toBeLessThan(1000);
    expect(named('タランチュラ星雲').positionPc).toBeDefined();
  });

  it('大きく見えている順に選び、中にいる星雲を見つける', () => {
    const list = prominent(nebulae, { x: 0, y: 0, z: 0 }, 5);
    expect(list.length).toBe(5);
    const m42 = named('オリオン大星雲');
    expect(insideOf([m42], m42.positionPc)?.name).toBe(m42.name);
    expect(insideOf([m42], { x: 0, y: 0, z: 0 })).toBeNull();
  });

  it('形の点は同じ星雲なら同じで、大きさの中に収まる', () => {
    const m57 = named('環状星雲');
    const a = nebulaParticles(m57, 500);
    const b = nebulaParticles(m57, 500);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(a.count).toBeGreaterThan(100);
    for (let i = 0; i < a.count; i++) {
      const d = Math.hypot(a.positions[i * 3] - m57.positionPc.x, a.positions[i * 3 + 1] - m57.positionPc.y, a.positions[i * 3 + 2] - m57.positionPc.z);
      expect(d).toBeLessThanOrEqual(m57.radiusPc * 1.01);
    }
  });
});
