import { describe, expect, it } from 'vitest';
import { clampMapView, fitMapDistance, mapCamera, mapPosition, mapRadius, mapRings, MAP_DISTANCE_LIMITS, MAP_UNIT_KM } from './star-map';
import { ECLIPTIC_TO_EQJ } from './small-bodies';
import { length, mulVec } from './vec';

const AU = 1.495978707e8;
const LY = 9.4607e12;

describe('mapRadius・mapPosition（距離を対数で縮める）', () => {
  it('中心は 0、遠いほど大きいが、桁が 1 つ増えても 1 ずつしか増えない', () => {
    expect(mapRadius(0)).toBe(0);
    expect(mapRadius(MAP_UNIT_KM * 9)).toBeCloseTo(1, 10);
    expect(mapRadius(AU)).toBeLessThan(mapRadius(100 * AU));
    expect(mapRadius(1e6 * LY) - mapRadius(1e5 * LY)).toBeCloseTo(1, 3);
  });

  it('向きはそのまま（黄道の座標にする）', () => {
    // 黄道の北極の方向（EQJ）は、マップの上（z）になる
    const north = mulVec(ECLIPTIC_TO_EQJ, { x: 0, y: 0, z: AU });
    const p = mapPosition(north, { x: 0, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(0, 6);
    expect(p.z).toBeCloseTo(mapRadius(AU), 6);
    expect(length(mapPosition({ x: 5 * LY, y: 0, z: 0 }, { x: LY, y: 0, z: 0 }))).toBeCloseTo(mapRadius(4 * LY), 6);
  });

  it('中心と同じ場所は原点', () => {
    expect(mapPosition({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 })).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('mapCamera（投影）', () => {
  it('中心は画面の真ん中、カメラの後ろは見えない', () => {
    const project = mapCamera({ yaw: 0.3, pitch: 0.4, distance: 10 }, 800, 600);
    const c = project({ x: 0, y: 0, z: 0 });
    expect(c.visible).toBe(true);
    expect(c.x).toBeCloseTo(400, 6);
    expect(c.y).toBeCloseTo(300, 6);
    expect(project({ x: 30 * Math.cos(0.4) * Math.cos(0.3), y: 30 * Math.cos(0.4) * Math.sin(0.3), z: 30 * Math.sin(0.4) }).visible).toBe(false);
  });

  it('真横から見ると、上（黄道の北）は画面の上に出る', () => {
    const project = mapCamera({ yaw: 0, pitch: 0, distance: 10 }, 800, 600);
    expect(project({ x: 0, y: 0, z: 1 }).y).toBeLessThan(300);
  });

  it('近い点ほど奥行きが小さい', () => {
    const project = mapCamera({ yaw: 0, pitch: 0, distance: 10 }, 800, 600);
    expect(project({ x: 2, y: 0, z: 0 }).depth).toBeLessThan(project({ x: -2, y: 0, z: 0 }).depth);
  });
});

describe('目盛りの円・カメラの距離', () => {
  it('いちばん遠い点の外側の 1 本まで', () => {
    const rings = mapRings(mapRadius(5 * AU));
    expect(rings.at(-1)!.km).toBeCloseTo(100 * AU, -3);
    expect(rings.length).toBe(3);
  });

  it('距離は範囲の中に収める', () => {
    expect(fitMapDistance(0)).toBeGreaterThanOrEqual(MAP_DISTANCE_LIMITS.min);
    expect(fitMapDistance(1000)).toBe(MAP_DISTANCE_LIMITS.max);
    expect(clampMapView({ yaw: 0, pitch: 3, distance: 0 }).pitch).toBeLessThan(Math.PI / 2);
  });
});
