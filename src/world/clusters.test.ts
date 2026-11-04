import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { clusterAt, clusterStars, decodeClusters, MAX_MEMBERS, nearbyClusters } from './clusters';

const clusters = decodeClusters(JSON.parse(readFileSync('public/data/clusters.json', 'utf8')));
const find = (name: string) => clusters.find((c) => c.name === name)!;

describe('星団', () => {
  it('散開星団と球状星団があり、プレアデス星団は約 135 pc', () => {
    expect(clusters.filter((c) => c.kind === 'open').length).toBeGreaterThan(6000);
    expect(clusters.filter((c) => c.kind === 'globular').length).toBeGreaterThan(100);
    const p = find('Melotte 22');
    expect(p.nameJa).toBe('プレアデス星団（すばる）');
    expect(Math.hypot(p.positionPc.x, p.positionPc.y, p.positionPc.z)).toBeCloseTo(135, -1);
  });

  it('メンバーの星は、同じ星団ならいつも同じ', () => {
    const c = find('NGC 5139');
    expect(JSON.stringify(clusterStars(c).slice(0, 5))).toBe(JSON.stringify(clusterStars(c).slice(0, 5)));
  });

  it('遠い星団では、メンバーの半数がおよそ半数半径 r50 の内側に入る（プラマーの分布）', () => {
    const c = find('NGC 5139'); // オメガ星団（約 5.3 kpc。本物の星のデータの外）
    const stars = clusterStars(c);
    expect(stars.length).toBe(MAX_MEMBERS.globular);
    const r = stars.map((s) => Math.hypot(s.position.x - c.positionPc.x, s.position.y - c.positionPc.y, s.position.z - c.positionPc.z)).sort((a, b) => a - b);
    const median = r[Math.floor(r.length / 2)];
    expect(median / c.r50Pc).toBeGreaterThan(0.8);
    expect(median / c.r50Pc).toBeLessThan(1.2);
  });

  it('近い星団では、本物の星のデータ（HYG）に入る明るい星は作らない', () => {
    const c = find('Melotte 22');
    const limit = 9 - 5 * Math.log10(135 / 10);
    expect(clusterStars(c).every((s) => s.absMag >= limit - 0.5)).toBe(true);
  });

  it('近くの星団と、中にいる星団', () => {
    const p = find('Melotte 22');
    expect(nearbyClusters(clusters, { x: p.positionPc.x + 10, y: p.positionPc.y, z: p.positionPc.z }, 3)[0].name).toBe('Melotte 22');
    expect(clusterAt(clusters, p.positionPc)?.name).toBe('Melotte 22');
    expect(clusterAt(clusters, { x: 0, y: 0, z: 0 })).toBeNull();
  });
});
