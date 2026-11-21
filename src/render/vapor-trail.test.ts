import { describe, expect, it } from 'vitest';
import { customKey, presetShape } from '../world/ship-presets';
import { KM_PER_LY } from '../world/units';
import { createTrailState, nodeOpacity, stepTrail, TRAIL_LIFETIME_S, trailStrength, vaporProfileOf } from './vapor-trail';

describe('trailStrength（ベイパーの強さ）', () => {
  it('止まっていると 0。全速で 1', () => {
    expect(trailStrength(0, 500)).toBe(0);
    expect(trailStrength(250, 500)).toBe(0.5);
    expect(trailStrength(500, 500)).toBe(1);
  });
  it('ダッシュ（全速より速い）では 1.25 まで', () => {
    expect(trailStrength(5000, 500)).toBe(1.25);
  });
  it('全速が分からない（0）ときは出さない', () => {
    expect(trailStrength(10, 0)).toBe(0);
  });
});

describe('軌道に沿ったベイパーの跡（stepTrail / nodeOpacity）', () => {
  const L = 0.03; // 30 m

  it('まっすぐ進むと、進んだ反対向き（+Z）にノードが連なる', () => {
    const s = createTrailState();
    for (let i = 0; i < 20; i++) {
      stepTrail(s, { x: 0, y: 0, z: -500 }, 1, L, 0.05);
    }
    expect(s.emitting).toBe(true);
    expect(s.nodes.length).toBeGreaterThan(4);
    expect(s.nodes[0].pos).toEqual({ x: 0, y: 0, z: 0 });
    const tail = s.nodes[s.nodes.length - 1];
    expect(tail.pos.z).toBeGreaterThan(L);
    expect(Math.abs(tail.pos.x)).toBeLessThan(1e-6);
  });

  it('途中で曲がると、曲がった軌道の形がノードに残る', () => {
    const s = createTrailState();
    for (let i = 0; i < 12; i++) {
      stepTrail(s, { x: 0, y: 0, z: -500 }, 1, L, 0.05);
    }
    for (let i = 0; i < 12; i++) {
      stepTrail(s, { x: -500, y: 0, z: 0 }, 1, L, 0.05);
    }
    const tail = s.nodes[s.nodes.length - 1];
    // 最初は +Z 向きに飛んでいた跡、後半は +X 向きへ移った跡が残る（一直線ではない）
    expect(tail.pos.z).toBeGreaterThan(L);
    expect(tail.pos.x).toBeGreaterThan(L);
  });

  it('止まったあとも空間に跡が残り、時間経過で徐々に薄れて完全に消える', () => {
    const s = createTrailState();
    for (let i = 0; i < 15; i++) {
      stepTrail(s, { x: 0, y: 0, z: -500 }, 1, L, 0.05);
    }
    const beforeCount = s.nodes.length;
    // 停止直後の濃さ
    stepTrail(s, { x: 0, y: 0, z: 0 }, 0, L, 0.05);
    expect(s.emitting).toBe(false);
    expect(s.nodes.length).toBeGreaterThanOrEqual(beforeCount - 1);
    const earlyOpacity = nodeOpacity(s.nodes[0]);
    expect(earlyOpacity).toBeGreaterThan(0.5);

    // 少し時間が経つと薄れるが、まだ消えない
    for (let i = 0; i < 8; i++) {
      stepTrail(s, { x: 0, y: 0, z: 0 }, 0, L, 0.05);
    }
    const midOpacity = nodeOpacity(s.nodes[0]);
    expect(midOpacity).toBeGreaterThan(0);
    expect(midOpacity).toBeLessThan(earlyOpacity);

    // TRAIL_LIFETIME_S 以上経過するとすべてのノードが消える
    const steps = Math.ceil((TRAIL_LIFETIME_S + 0.2) / 0.05);
    for (let i = 0; i < steps; i++) {
      stepTrail(s, { x: 0, y: 0, z: 0 }, 0, L, 0.05);
    }
    expect(s.nodes.length).toBe(0);
  });

  it('他機が時速 1 万光年で飛ぶと、実空間（光年単位）の移動距離に沿った軌跡が残り徐々に消える', () => {
    const s = createTrailState();
    const speedKmS = (10_000 / 3600) * KM_PER_LY; // 時速 1 万光年 ≈ 2.78 光年/秒
    const dt = 0.05;
    for (let i = 0; i < 6; i++) {
      const disp = { x: speedKmS * dt, y: 0, z: 0 };
      stepTrail(s, { x: speedKmS, y: 0, z: 0 }, 1, L, dt, undefined, disp);
    }
    const tail = s.nodes[s.nodes.length - 1];
    // 船基準の 0.03 km ではなく、実際の移動距離（光年規模）がノード位置に残る
    expect(tail.pos.x).toBeLessThan(-0.5 * KM_PER_LY);
    const spanKm = Math.abs(tail.pos.x);

    // 部屋から抜けたあと（速度 0）もその空間に留まりつつ徐々に薄れて消える
    stepTrail(s, { x: 0, y: 0, z: 0 }, 0, L, 1.0);
    expect(s.nodes.length).toBeGreaterThan(0);
    expect(Math.abs(s.nodes[s.nodes.length - 1].pos.x)).toBeGreaterThan(spanKm * 0.9);
    const fadeSteps = Math.ceil(TRAIL_LIFETIME_S / 0.1);
    for (let i = 0; i < fadeSteps; i++) {
      stepTrail(s, { x: 0, y: 0, z: 0 }, 0, L, 0.1);
    }
    expect(s.nodes.length).toBe(0);
  });
});

describe('UFO の形ごとのベイパー（vaporProfileOf）', () => {
  it('saucer・bell・ring で異なる位置と色のプロファイルを返す', () => {
    const saucer = vaporProfileOf(presetShape('saucer'));
    const bell = vaporProfileOf(presetShape('bell'));
    const ring = vaporProfileOf(presetShape('ring'));

    expect(saucer.kind).toBe('saucer');
    expect(bell.kind).toBe('bell');
    expect(ring.kind).toBe('ring');

    // ベルは暖色の 3 本の推進口（下の 3 つの球）
    expect(bell.tubes[0].colorHead[0]).toBeGreaterThan(bell.tubes[0].colorHead[2]);
    expect(bell.tubes[1].yRatio).toBeLessThan(-0.15);
    expect(bell.tubes[2].yRatio).toBeLessThan(-0.15);

    // リングは外輪に合わせた広い位置と紫〜青緑の配色
    expect(Math.abs(ring.tubes[2].xRatio)).toBeGreaterThan(Math.abs(saucer.tubes[2].xRatio));
    expect(ring.tubes[0].colorHead[2]).toBeGreaterThan(ring.tubes[0].colorHead[1]);
  });

  it('マイ UFO の幅と光るブロックの色に合わせてベイパーが変わる', () => {
    // 幅が狭く（x: 38..42 → 2 m）、長さが長い（z: 20..60 → 20 m）、光る赤（c: 22）を持つ自作 UFO
    const narrowRed = {
      key: customKey('test-narrow-red-ship-0001'),
      blocks: [
        { x: 38, y: 39, z: 20, s: 1 as const, c: 3 },
        { x: 40, y: 39, z: 20, s: 1 as const, c: 3 },
        { x: 38, y: 39, z: 58, s: 1 as const, c: 22 },
        { x: 40, y: 39, z: 58, s: 1 as const, c: 22 },
      ],
    };
    const p = vaporProfileOf(narrowRed);
    expect(p.kind).toBe('custom');
    // 左右の翼端位置が狭い幅（2m / 20m = ±0.05 付近）に縮む
    expect(Math.abs(p.tubes[2].xRatio)).toBeLessThan(0.15);
    expect(Math.abs(p.tubes[3].xRatio)).toBeLessThan(0.15);
    // 赤の発光ブロックに合わせて赤が優勢な色になる
    expect(p.tubes[0].colorHead[0]).toBeGreaterThan(p.tubes[0].colorHead[2]);
    expect(p.tubes[2].colorHead[0]).toBeGreaterThan(p.tubes[2].colorHead[2]);
  });
});
