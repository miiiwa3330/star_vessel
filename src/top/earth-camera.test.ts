import { describe, expect, it } from 'vitest';
import { alphaForCenter, cross3, distanceForRadius, dot3, forwardLeg, legEndCenter, limbAlpha, posedView, subjectView, type EarthCameraPose } from './earth-camera';
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

describe('縁の見え方の alpha（limbAlpha）', () => {
  it('縁が画面の下から 0.42（NDC）の高さに見える角度になる', () => {
    const alpha = limbAlpha(6371, 11_000, 42, -0.42);
    const rho = Math.asin(6371 / 11_000);
    // 中心の向きから縁まで rho、縁から画面の真ん中まで、画面の高さの 0.42 分
    expect(Math.tan(alpha - rho) / Math.tan((42 * Math.PI) / 360)).toBeCloseTo(0.42, 9);
  });
});

describe('前へ飛ぶ移動（forwardLeg）：月ー地球ー火星。向きを変えず、まっすぐ進む', () => {
  const FOV = 42;
  const halfFov = (FOV * Math.PI) / 360;
  const up = unit(cross3(unit({ x: 0.3, y: 0.2, z: 1 }), { x: 1, y: 0, z: 0 }));
  const forward = unit(cross3(up, { x: 0, y: 0, z: 1 }));
  const S = 2_000_000;
  const rFrom = 11_000;
  const earthR = 6371;
  const alphaFrom = limbAlpha(earthR, rFrom, FOV, -0.42);
  const sub3 = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const angleBetween = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.acos(Math.min(1, Math.max(-1, dot3(unit(a), unit(b)))));

  // 地球 → 月（半径 1737）・火星（3389）。どちらも、同じ式
  for (const [label, R] of [['月', 1737.4], ['火星', 3389.5]] as const) {
    describe(`地球 → ${label}`, () => {
      const rTo = (R / earthR) * rFrom; // 地球と同じ構図（縁の見え方）
      const alphaTo = limbAlpha(R, rTo, FOV, -0.42);
      const opts = { up, forward, rFrom, alphaFrom, rTo, alphaTo, stageKm: S };
      const at = (f: number) => forwardLeg({ ...opts, f });
      const center = legEndCenter(opts);

      it('出発は地球の構図、着いたときは、行き先が同じ構図（縁が画面の下に弧）', () => {
        const a = at(0);
        const a0 = posedView({ dir: up, u: forward, distanceKm: rFrom, alpha: alphaFrom });
        expect(length(sub3(a.position, a0.position))).toBeLessThan(1e-6);
        expect(dot3(a.forward, a0.forward)).toBeCloseTo(1, 9);
        const b = at(1);
        const b0 = posedView({ dir: up, u: forward, distanceKm: rTo, alpha: alphaTo });
        expect(length(sub3(sub3(b.position, center), b0.position))).toBeLessThan(1e-3);
        expect(dot3(b.forward, b0.forward)).toBeCloseTo(1, 9);
        expect(dot3(b.up, b0.up)).toBeCloseTo(1, 9);
      });

      it('まっすぐ進む：位置は、出発点から、見る向きへの 1 本の線の上にあり、向きは変わらない', () => {
        const start = at(0).position;
        const dir = at(0).forward;
        for (let i = 1; i <= 132; i++) {
          const pose = at(i / 132);
          const d = sub3(pose.position, start);
          // 線の上：見る向きとの外積がほぼ 0
          const off = length(cross3(d, dir));
          expect(off).toBeLessThan(1e-6 * Math.max(1, length(d)));
          // 向きは、出発と着くときの alpha が同じなら、変わらない
          expect(dot3(pose.forward, dir)).toBeCloseTo(1, 9);
          expect(dot3(pose.up, at(0).up)).toBeCloseTo(1, 9);
        }
      });

      it('進む向きは、見る向き（前へ）で、距離は増え続ける（行ったり来たり・上下の揺れがない）', () => {
        const start = at(0).position;
        const dir = at(0).forward;
        let prev = 0;
        for (let i = 1; i <= 132; i++) {
          const along = dot3(sub3(at(i / 132).position, start), dir);
          expect(along).toBeGreaterThan(prev);
          prev = along;
        }
      });

      it('1 コマで動く距離は、近い方の天体までの距離の 2 割以下（出発の天体が、動き出しで一瞬で消えない）', () => {
        let prev = at(0).position;
        for (let i = 1; i <= 132; i++) {
          const cur = at(i / 132).position;
          const move = length(sub3(cur, prev));
          expect(move).toBeLessThan(Math.min(length(prev), length(sub3(center, prev))) * 0.2);
          prev = cur;
        }
      });

      it('地球は、最初は画面にあり、見えている間に画面の下へ落ち、消えたら戻ってこない', () => {
        const seen = (f: number) => {
          const pose = at(f);
          const toEarth = { x: -pose.position.x, y: -pose.position.y, z: -pose.position.z };
          const rho = Math.asin(Math.min(1, earthR / length(toEarth)));
          return angleBetween(toEarth, pose.forward) - rho <= halfFov;
        };
        expect(seen(0)).toBe(true);
        let gone = -1;
        for (let i = 0; i <= 132; i++) {
          if (!seen(i / 132) && gone < 0) gone = i;
          if (gone >= 0) expect(seen(i / 132)).toBe(false);
        }
        expect(gone / 132).toBeGreaterThan(0.1);
        expect(gone / 132).toBeLessThan(0.4);
        // 消える向きは、画面の下
        const pose = at(gone / 132);
        const toEarth = unit({ x: -pose.position.x, y: -pose.position.y, z: -pose.position.z });
        expect(dot3(toEarth, pose.up)).toBeLessThan(0);
      });

      it('行き先は、最初から画面の真ん中（奥）に、小さな点として見え、大きくなりながら、最後に画面の下の構図へ落ち着く', () => {
        const a = at(0);
        const toDest = (p: EarthCameraPose) => sub3(center, p.position);
        // 最初：真ん中から 1 度以内。見かけの半径は 0.1 度以下（点）。画面の上から出てこない
        expect(angleBetween(toDest(a), a.forward)).toBeLessThan((1 * Math.PI) / 180);
        expect(Math.asin(R / length(toDest(a)))).toBeLessThan((0.1 * Math.PI) / 180);
        // 途中は、いつも画面の中（上へ外れない）。真ん中から下へ、単調に動く
        let prevOffset = -1;
        let prevSize = 0;
        for (let i = 0; i <= 132; i++) {
          const pose = at(i / 132);
          const rel = toDest(pose);
          const offset = angleBetween(rel, pose.forward);
          const size = Math.asin(Math.min(1, R / length(rel)));
          expect(offset).toBeLessThanOrEqual(halfFov + size + 1e-9);
          expect(offset).toBeGreaterThanOrEqual(prevOffset - 1e-9);
          expect(size).toBeGreaterThanOrEqual(prevSize - 1e-12);
          // 下にずれる（上ではない）：カメラの上向きの成分が、0 以下
          expect(dot3(unit(rel), pose.up)).toBeLessThanOrEqual(1e-9);
          prevOffset = offset;
          prevSize = size;
        }
        // 着いたとき：alpha だけ下
        expect(prevOffset).toBeCloseTo(alphaTo, 6);
      });

      it('どの途中でも、向きは単位ベクトルで、up は forward に垂直。位置は有限', () => {
        for (let i = 0; i <= 132; i++) {
          const m = at(i / 132);
          expect(length(m.forward)).toBeCloseTo(1, 6);
          expect(length(m.up)).toBeCloseTo(1, 6);
          expect(dot3(m.forward, m.up)).toBeCloseTo(0, 6);
          expect(Number.isFinite(m.position.x + m.position.y + m.position.z)).toBe(true);
        }
      });

      it('前半と後半が、真ん中でつながる（位置の連続）', () => {
        const a = at(0.5 - 1e-9);
        const b = at(0.5 + 1e-9);
        expect(length(sub3(a.position, b.position))).toBeLessThan(1);
      });
    });
  }

  it('月と火星は、同じ動き：地球が消えるコマ・進む距離が同じ（行き先の大きさだけが違う）', () => {
    const run = (R: number) => {
      const rTo = (R / earthR) * rFrom;
      const base = { up, forward, rFrom, alphaFrom, rTo, alphaTo: limbAlpha(R, rTo, FOV, -0.42), stageKm: S };
      return [0.1, 0.3, 0.5].map((f) => forwardLeg({ ...base, f }).position);
    };
    const moon = run(1737.4);
    const mars = run(3389.5);
    // 前半の位置は、行き先の大きさによらない
    for (let i = 0; i < 3; i++) expect(length(sub3(moon[i], mars[i]))).toBeLessThan(1e-6 * length(moon[i]) + 1e-3);
  });

  it('地球へ戻る（月 → 地球）も、同じ式：月は画面の下へ消え、地球が奥の真ん中から現れる', () => {
    const rMoon = (1737.4 / earthR) * rFrom;
    const opts = { up, forward, rFrom: rMoon, alphaFrom: limbAlpha(1737.4, rMoon, FOV, -0.42), rTo: rFrom, alphaTo: alphaFrom, stageKm: S };
    const earthCenter = legEndCenter(opts); // 月の中心が原点のときの、地球の中心
    const a = forwardLeg({ ...opts, f: 0 });
    // 最初：地球は、画面の真ん中の小さな点
    expect(angleBetween(sub3(earthCenter, a.position), a.forward)).toBeLessThan((1 * Math.PI) / 180);
    expect(Math.asin(earthR / length(sub3(earthCenter, a.position)))).toBeLessThan((0.2 * Math.PI) / 180);
    // 月は、最初は画面にあり、そのうち画面の下へ消える
    const seenMoon = (f: number) => {
      const pose = forwardLeg({ ...opts, f });
      const toMoon = { x: -pose.position.x, y: -pose.position.y, z: -pose.position.z };
      return angleBetween(toMoon, pose.forward) - Math.asin(Math.min(1, 1737.4 / length(toMoon))) <= halfFov;
    };
    expect(seenMoon(0)).toBe(true);
    expect(seenMoon(0.5)).toBe(false);
  });
});
