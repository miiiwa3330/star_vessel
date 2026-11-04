import { describe, expect, it } from 'vitest';
import { paintRing, paintSurface, type SurfaceLook } from './surface';

const banded: SurfaceLook = { kind: 'banded', colors: [[100, 50, 0], [250, 240, 200]], bands: 8, turbulence: 0.3 };
const rocky: SurfaceLook = { kind: 'rocky', colors: [[60, 60, 60], [200, 200, 200]], craters: 0.4 };

describe('paintSurface', () => {
  it('同じ種なら同じ模様、違う種なら違う模様', () => {
    const a = paintSurface(banded, 1, 64, 32).data;
    const b = paintSurface(banded, 1, 64, 32).data;
    const c = paintSurface(banded, 2, 64, 32).data;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('経度 0 度と 360 度のつなぎ目で色が飛ばない', () => {
    const w = 128;
    const img = paintSurface(rocky, 5, w, 64);
    let maxJump = 0;
    for (let row = 0; row < 64; row++) {
      const first = (row * w) * 4;
      const last = (row * w + w - 1) * 4;
      maxJump = Math.max(maxJump, Math.abs(img.data[first] - img.data[last]));
    }
    expect(maxJump).toBeLessThan(40);
  });

  it('色は並べた色の範囲に収まる', () => {
    const img = paintSurface(banded, 3, 64, 32);
    for (let i = 0; i < img.data.length; i += 4) {
      expect(img.data[i]).toBeGreaterThanOrEqual(99);
      expect(img.data[i]).toBeLessThanOrEqual(251);
      expect(img.data[i + 3]).toBe(255);
    }
  });
});

describe('paintRing', () => {
  it('帯の無いすき間は透明', () => {
    const img = paintRing(
      [
        { innerKm: 100, outerKm: 200, opacity: 1 },
        { innerKm: 300, outerKm: 400, opacity: 1 },
      ],
      [200, 200, 200],
      1,
      300,
    );
    // 250 km（すき間）は左から (250−100)/300 = 半分の位置
    expect(img.data[150 * 4 + 3]).toBe(0);
    expect(img.data[10 * 4 + 3]).toBeGreaterThan(100);
  });
});
