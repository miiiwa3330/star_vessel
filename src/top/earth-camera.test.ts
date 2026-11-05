import { describe, expect, it } from 'vitest';
import { alphaForCenter, cross3, distanceForRadius, dot3, posedView, subjectView, type EarthCameraPose } from './earth-camera';
import { length } from '../world/vec';

type Pose = EarthCameraPose;
const unit = (a: { x: number; y: number; z: number }) => ({ x: a.x / length(a), y: a.y / length(a), z: a.z / length(a) });
/** カメラの本当の上（forward に垂直）。lookAt が up から作るのと同じ */
const trueUp = (p: Pose) => unit(cross3(cross3(p.forward, p.up), p.forward));

describe('見せたい船が縁の上に見えるカメラ', () => {
  const opts = (aim: { x: number; y: number; z: number }, extra: Partial<Parameters<typeof subjectView>[0]> = {}) => ({
    aim,
    sunDir: { x: 1, y: 0, z: 0 },
    radiusKm: 6371,
    distanceKm: 11_000,
    fovDeg: 42,
    limbNdcY: -0.42,
    subjectNdcY: 0.1,
    sunTarget: 0.45,
    ...extra,
  });
  const project = (pose: Pose, p: { x: number; y: number; z: number }, fov: number) => {
    const f = pose.forward;
    const up = trueUp(pose);
    const right = unit(cross3(f, up));
    const v = { x: p.x - pose.position.x, y: p.y - pose.position.y, z: p.z - pose.position.z };
    const t = Math.tan((fov * Math.PI) / 360);
    return { x: dot3(v, right) / dot3(v, f) / t, y: dot3(v, up) / dot3(v, f) / t };
  };
  const aims = [
    { x: 20_000, y: 0, z: 0 },
    { x: -14_000, y: 9_000, z: 5_000 },
    { x: 0, y: -25_000, z: 12_000 },
    { x: 7_000, y: 7_000, z: 7_000 },
    { x: 60_000, y: -30_000, z: 40_000 },
    { x: 120_000, y: 0, z: 0 },
  ];

  it('船が、画面の真ん中の縦の線の上の、望んだ高さに映る', () => {
    for (const aim of aims) {
      const pose = subjectView(opts(aim));
      const s = project(pose, aim, 42);
      expect(Math.abs(s.x)).toBeLessThan(0.02);
      expect(s.y).toBeCloseTo(0.1, 1);
      expect(s.y).toBeCloseTo(pose.subjectNdcY, 2);
    }
  });

  it('地球の縁のいちばん高いところは、指定の高さのまま', () => {
    for (const aim of aims) {
      const pose = subjectView(opts(aim));
      const toCenter = { x: -pose.position.x, y: -pose.position.y, z: -pose.position.z };
      const rho = Math.asin(6371 / 11_000);
      const tilt = Math.asin(dot3(toCenter, trueUp(pose)) / length(toCenter));
      expect(Math.tan(tilt + rho) / Math.tan((42 * Math.PI) / 360)).toBeCloseTo(-0.42, 1);
    }
  });

  it('カメラは地球から指定の距離にあり、船は地球に隠されない', () => {
    for (const aim of aims) {
      const pose = subjectView(opts(aim));
      expect(length(pose.position)).toBeCloseTo(11_000, 6);
      const d = { x: aim.x - pose.position.x, y: aim.y - pose.position.y, z: aim.z - pose.position.z };
      const len2 = dot3(d, d);
      const t = Math.max(0, Math.min(1, -dot3(pose.position, d) / len2));
      const closest = { x: pose.position.x + t * d.x, y: pose.position.y + t * d.y, z: pose.position.z + t * d.z };
      expect(length(closest)).toBeGreaterThanOrEqual(6371);
    }
  });

  it('地球に近すぎる船（高度数百 km）でも、縁より上に見える', () => {
    const aim = { x: 6_900, y: 0, z: 0 };
    const pose = subjectView(opts(aim));
    const s = project(pose, aim, 42);
    expect(s.y).toBeGreaterThan(-0.42);
  });

  it('前の角を渡すと、近い側のカメラの位置を選ぶ（反対側へ飛ばない）', () => {
    const aim = { x: 20_000, y: 0, z: 0 };
    const a = subjectView(opts(aim));
    const b = subjectView(opts({ x: 20_000, y: 400, z: 0 }, { phiHint: a.phi }));
    const diff = Math.abs(((b.phi - a.phi + Math.PI * 3) % (2 * Math.PI)) - Math.PI);
    expect(diff).toBeLessThan(0.6);
    expect(length({ x: b.position.x - a.position.x, y: b.position.y - a.position.y, z: b.position.z - a.position.z })).toBeLessThan(3_000);
  });

  it('カメラの位置を、太陽の当たり方の目標（境目が見える）に近づける。船が夜の側にいて届かないときは、できるだけ近づける', () => {
    const c = (aim: { x: number; y: number; z: number }) => dot3(subjectView(opts(aim)).position, { x: 1, y: 0, z: 0 }) / 11_000;
    // 太陽から斜めの向きにいる船：目標に届く（太陽の真下にいる船は、カメラの位置が船から一定の角度で決まるので、太陽の当たり方を選べない）
    expect(Math.abs(c({ x: 7_000, y: 7_000, z: 7_000 }) - 0.45)).toBeLessThan(0.1);
    expect(Math.abs(c({ x: 5_000, y: 5_000, z: 5_000 }) - 0.45)).toBeLessThan(0.1);
    // 夜の側にいる船：目標には届かないが、昼の側（内積が正）の方へ、できるだけ寄る
    const night = { x: -14_000, y: 9_000, z: 5_000 };
    const other = subjectView(opts(night, { sunTarget: -0.9 }));
    expect(c(night)).toBeGreaterThan(dot3(other.position, { x: 1, y: 0, z: 0 }) / 11_000);
  });
});

describe('スクロールで変わるカメラ（地球の下半分が画面の上に来る）', () => {
  const R = 6371;
  const FOV = 42;
  const base = subjectView({ aim: { x: 7_000, y: 7_000, z: 7_000 }, sunDir: { x: 1, y: 0, z: 0 }, radiusKm: R, distanceKm: 11_000, fovDeg: FOV, limbNdcY: -0.42, subjectNdcY: 0.1, sunTarget: 0.45 });
  const half = Math.tan((FOV * Math.PI) / 360);
  /** 地球の中心が画面のどの高さに映るか */
  const centerNdc = (p: Pose) => {
    const toCenter = { x: -p.position.x, y: -p.position.y, z: -p.position.z };
    const f = p.forward;
    const up = trueUp(p);
    return dot3(toCenter, up) / dot3(toCenter, f) / half;
  };

  it('subjectView が返す basis から作り直すと、元のカメラと同じ', () => {
    const again = posedView(base.basis);
    expect(length({ x: again.position.x - base.position.x, y: again.position.y - base.position.y, z: again.position.z - base.position.z })).toBeLessThan(1e-6);
    expect(dot3(again.forward, base.forward)).toBeCloseTo(1, 9);
    expect(dot3(again.up, base.up)).toBeCloseTo(1, 9);
  });

  it('alpha を負にすると、地球の中心が画面の真ん中より上に映る。指定の高さに合わせられる', () => {
    for (const y of [-1.9, -0.5, 0, 0.6, 1.05]) {
      const p = posedView({ ...base.basis, alpha: alphaForCenter(y, FOV) });
      expect(centerNdc(p)).toBeCloseTo(y, 6);
    }
  });

  it('距離は指定どおり。地球の中心を画面の上の端の少し上に置くと、下半分が画面の上に入る', () => {
    const D = distanceForRadius(R, 0.9, FOV);
    // 地球の半径が画面の高さの 0.9（中心から上の端までの距離の 0.9 倍）に映る距離
    expect(Math.asin(R / D)).toBeCloseTo(Math.atan(0.9 * half), 9);
    const p = posedView({ ...base.basis, distanceKm: D, alpha: alphaForCenter(1.05, FOV) });
    expect(length(p.position)).toBeCloseTo(D, 6);
    // 地球の下の縁（中心から下へ半径ぶんの点）は、画面の中に映る：中心が 1.05、半径が 0.9 なので、縁は 0.15
    expect(centerNdc(p) - 0.9).toBeCloseTo(0.15, 1);
    // 上の縁は、画面の外（+1 より上）
    expect(centerNdc(p) + 0.9).toBeGreaterThan(1);
  });

  it('スクロールで動かす途中も、カメラの向きと上は単位ベクトルのまま', () => {
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const p = posedView({ ...base.basis, distanceKm: 11_000 + t * 8_000, alpha: base.basis.alpha + (alphaForCenter(1.05, FOV) - base.basis.alpha) * t });
      expect(length(p.forward)).toBeCloseTo(1, 9);
      expect(length(p.up)).toBeCloseTo(1, 9);
    }
  });
});
