/**
 * レーダー（要件 F10）。自分の向きを基準にした円の中に、まわりの物を置く。
 *
 * - 円の上が、自分の進む方向（カメラの −Z）
 * - 中心からの距離は、実際の距離の対数（遠いほど縮める）。RADAR_RANGE の外は円のふちに置く
 * - 上下は円に描けないので、自分より上か下かだけを返す
 */
import { rotateByInverse, type Quat } from './quat';
import { length, sub, type Vec3 } from './vec';

export type RadarKind = 'body' | 'warp' | 'ship';

export interface RadarTarget {
  kind: RadarKind;
  id: string;
  label: string;
  /** 太陽中心・EQJ・km */
  positionKm: Vec3;
}

export interface RadarBlip {
  kind: RadarKind;
  id: string;
  label: string;
  /** 円の中の位置。中心が (0, 0)、半径 1。y は上が正 */
  x: number;
  y: number;
  distanceKm: number;
  /** 自分の上下どちらにあるか */
  above: boolean;
  /** 範囲の外で、ふちに置いたか */
  clamped: boolean;
}

/** 中心から 1,000 km 〜 ふちで 100 億 km（海王星の外まで） */
export const RADAR_RANGE = { minKm: 1e3, maxKm: 1e10 };

export function radarBlips(
  observerKm: Vec3,
  orientation: Quat,
  targets: readonly RadarTarget[],
  range = RADAR_RANGE,
): RadarBlip[] {
  const span = Math.log(range.maxKm / range.minKm);
  return targets.map((t) => {
    const rel = sub(t.positionKm, observerKm);
    const distanceKm = length(rel);
    const local = rotateByInverse(orientation, rel);
    // 自分の水平面（右：+x、前：−z）に落とした向き
    const right = local.x;
    const forward = -local.z;
    const planar = Math.hypot(right, forward);
    const raw = Math.log(Math.max(distanceKm, range.minKm) / range.minKm) / span;
    const r = Math.min(1, raw);
    return {
      kind: t.kind,
      id: t.id,
      label: t.label,
      x: planar > 0 ? (r * right) / planar : 0,
      y: planar > 0 ? (r * forward) / planar : 0,
      distanceKm,
      above: local.y >= 0,
      clamped: raw > 1,
    };
  });
}
