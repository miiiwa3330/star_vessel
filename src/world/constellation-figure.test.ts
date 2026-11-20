import { describe, expect, it } from 'vitest';
import { artFigureTransform, artGrid, artMapping, constellationFigures, type ConstellationArt } from './constellation-figure';

const norm = (v: number[]) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l) as [number, number, number];
};
// 春分点（+X）のあたりの 3 つの星
const A = norm([1, 0, 0]);
const B = norm([1, 0.1, 0]);
const C = norm([1, 0, 0.1]);
const art: ConstellationArt = { file: 'x.png', size: [256, 256], anchors: [[200, 200, ...A], [56, 200, ...B], [200, 56, ...C]] };

describe('artMapping・artGrid（絵を空に貼る）', () => {
  it('合わせる 3 つの点は、その星の方向になる', () => {
    const map = artMapping(art)!;
    for (const a of art.anchors) {
      const p = norm(map(a[0], a[1]));
      expect(p[0]).toBeCloseTo(a[2], 9);
      expect(p[1]).toBeCloseTo(a[3], 9);
      expect(p[2]).toBeCloseTo(a[4], 9);
    }
  });
  it('3 つの点が 1 本の線に並んでいると、決められない', () => {
    expect(artMapping({ ...art, anchors: [[0, 0, ...A], [10, 10, ...B], [20, 20, ...C]] })).toBeNull();
  });
  it('網は (n+1)² 個の頂点で、どれも長さ 1。画像の左上は uv の (0, 1)', () => {
    const g = artGrid(art, 4)!;
    expect(g.directions.length).toBe(25 * 3);
    expect(g.indices.length).toBe(16 * 6);
    for (let i = 0; i < 25; i++) expect(Math.hypot(g.directions[i * 3], g.directions[i * 3 + 1], g.directions[i * 3 + 2])).toBeCloseTo(1, 6);
    expect([g.uvs[0], g.uvs[1]]).toEqual([0, 1]);
  });
});

describe('constellationFigures（図鑑の星座の図）', () => {
  // 星のデータ：x・y・z（pc）、絶対等級、色、id
  const star = (id: number, d: number[], dist: number, absMag = 1) => [d[0] * dist, d[1] * dist, d[2] * dist, absMag, 0.6, id];
  const stars = new Float32Array([...star(1, A, 10), ...star(2, B, 50), ...star(3, C, 100)]);
  const list = [
    { id: 'Tst', nameJa: 'てすと座', nameEn: 'Test', lines: [[1, 2], [1, 99]] as [number, number][] },
    { id: 'Tst', nameJa: 'てすと座', nameEn: 'Test', lines: [[1, 3]] as [number, number][] },
    { id: 'Emp', nameJa: 'から座', nameEn: 'Empty', lines: [[98, 99]] as [number, number][] },
  ];
  const figs = constellationFigures(list, stars, 6);
  const f = figs.get('Tst')!;

  it('同じ略号は 1 つにまとめ、星のデータに無い星の線は入れない。線の無い星座は入れない', () => {
    expect(figs.size).toBe(1);
    expect(f.lines.length).toBe(2 * 4);
    expect(f.stars.length).toBe(3);
  });
  it('北が上・東（赤経が増える向き）が左。半径 0.7 の円に収まる', () => {
    const a = f.project(...A);
    const b = f.project(...B); // A より東
    const c = f.project(...C); // A より北
    expect(b[0]).toBeLessThan(a[0]);
    expect(c[1]).toBeGreaterThan(a[1]);
    for (const s of f.stars) expect(Math.hypot(s.x, s.y)).toBeLessThanOrEqual(0.7 + 1e-6);
  });
  it('見かけの等級は距離で決まる（10 pc なら絶対等級と同じ）', () => {
    expect(f.stars[0].mag).toBeCloseTo(1, 5);
    expect(f.stars[2].mag).toBeCloseTo(6, 5);
  });
  it('絵の合わせる点は、図の上の星の位置に重なる', () => {
    const t = artFigureTransform(art, f)!;
    for (const a of art.anchors) {
      const q = f.project(a[2], a[3], a[4]);
      expect(t[0] * a[0] + t[2] * a[1] + t[4]).toBeCloseTo(q[0], 6);
      expect(t[1] * a[0] + t[3] * a[1] + t[5]).toBeCloseTo(q[1], 6);
    }
  });
});
