import { describe, expect, it } from 'vitest';
import { globeExtent, mapUv, projectCloud, renderGlobe, toBody, viewMatrix } from './globe-render';

describe('viewMatrix・toBody（回す向き）', () => {
  it('回していなければ、見る座標と体の座標は同じ', () => {
    expect(toBody(viewMatrix(0, 0), 0.1, 0.2, 0.3).map((v) => +v.toFixed(9))).toEqual([0.1, 0.2, 0.3]);
  });
  it('pitch で北極（+y）がこちらへ倒れる', () => {
    // 90 度倒すと、体の北極は見る人の方（+z）を向く
    const m = viewMatrix(0, Math.PI / 2);
    const [, , z] = [m[1], m[4], m[7]];
    expect(z).toBeCloseTo(1, 9);
  });
});

describe('mapUv（地図の上の位置）', () => {
  it('正面（+z）は地図の真ん中、北極は上の端', () => {
    expect(mapUv(0, 0, 1)).toEqual([0.5, 0.5]);
    expect(mapUv(0, 1, 0)[1]).toBeCloseTo(0, 9);
  });
});

describe('renderGlobe', () => {
  it('真ん中は球で塗られ、角は透明。光の当たる左上は、右下より明るい', () => {
    const size = 40;
    const out = new Uint8ClampedArray(size * size * 4);
    renderGlobe(out, size, null, { yaw: 0, pitch: 0, color: [200, 200, 200] });
    const at = (x: number, y: number) => out[(y * size + x) * 4];
    const alpha = (x: number, y: number) => out[(y * size + x) * 4 + 3];
    expect(alpha(20, 20)).toBe(255);
    expect(alpha(0, 0)).toBe(0);
    expect(at(12, 12)).toBeGreaterThan(at(28, 28));
  });
  it('環があると、球の外にも環が描かれる', () => {
    const size = 60;
    const opts = { yaw: 0, pitch: 0.4, color: [200, 200, 200] as const, ring: { inner: 1.3, outer: 2.2, color: [220, 200, 160] as const, alpha: 0.9 } };
    const out = new Uint8ClampedArray(size * size * 4);
    renderGlobe(out, size, null, opts);
    const ext = globeExtent(opts);
    // 球の右の、環の上の点（x ≈ 1.8）
    const px = Math.round(((1.8 / ext + 1) / 2) * size);
    expect(out[(Math.round(size / 2) * size + px) * 4 + 3]).toBeGreaterThan(0);
  });
});

describe('projectCloud', () => {
  it('奥のものから並べる', () => {
    const pt = (z: number) => ({ x: 0, y: 0, z, s: 1, r: 0, g: 0, b: 0, a: 1 });
    const out = projectCloud([pt(0.5), pt(-0.5), pt(0)], 0, 0);
    expect(out.map((o) => o.z)).toEqual([-0.5, 0, 0.5]);
  });
});
