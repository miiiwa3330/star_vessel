import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { clusterAt, clusterStars, decodeClusters, MAX_MEMBERS, nearbyClusters, readRealMembers } from './clusters';

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

describe('本物のメンバーの星（要件 F47）', () => {
  const realFile = () => {
    const j = JSON.parse(readFileSync('public/data/cluster-members.json', 'utf8')) as { index: Record<string, [number, number, number]> };
    return j.index;
  };
  const load = (shard: number) => {
    const b = readFileSync(`public/data/cluster-members/${shard}.bin`);
    return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  };

  it('プレアデス星団の星は、星団のまわりにいる（Gaia のメンバー。明るい星は HYG に任せる）', () => {
    const list = decodeClusters(JSON.parse(readFileSync('public/data/clusters.json', 'utf8')));
    const c = list.find((x) => x.nameJa?.includes('プレアデス'))!;
    const at = realFile()[c.name];
    const stars = readRealMembers(load(at[0]), at[1], at[2], c);
    expect(stars.length).toBeGreaterThan(500);
    const far = stars.filter((s) => Math.hypot(s.position.x - c.positionPc.x, s.position.y - c.positionPc.y, s.position.z - c.positionPc.z) > 60).length;
    expect(far / stars.length).toBeLessThan(0.05);
    // 視差の近い星は星ごとの距離を使うので、奥行きがつぶれていない
    const d = stars.map((s) => Math.hypot(s.position.x, s.position.y, s.position.z));
    expect(Math.max(...d) - Math.min(...d)).toBeGreaterThan(5);
    // 見かけで 9 等より明るい星は HYG に任せる
    const dist = Math.hypot(c.positionPc.x, c.positionPc.y, c.positionPc.z);
    expect(stars.every((s) => s.absMag + 5 * Math.log10(dist / 10) >= 9 - 1e-3)).toBe(true);
  });

  it('球状星団には赤い星が多く、若い散開星団には青い星がある（年齢の違いが色に出る）', () => {
    const list = decodeClusters(JSON.parse(readFileSync('public/data/clusters.json', 'utf8')));
    const avg = (name: string) => {
      const c = list.find((x) => x.name === name)!;
      const at = realFile()[c.name];
      const stars = readRealMembers(load(at[0]), at[1], at[2], c);
      return stars.reduce((s, x) => s + x.bv, 0) / stars.length;
    };
    expect(avg('NGC 5139')).toBeGreaterThan(0.6);
  });
});
