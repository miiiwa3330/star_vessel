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

/** 名前を出せる点（レーダーの座標。上が +y）と、優先の順（小さいほど先） */
export interface RadarLabelCandidate {
  id: string;
  x: number;
  y: number;
  label: string;
  priority: number;
}

/**
 * レーダーに名前を出す点を選ぶ。優先の高い順に、ほかの名前・点の印と重ならないものだけ、最大 max 個。
 * 名前は点の右に置き、幅は 1 文字 charW（全角の文字の幅。半角は半分）、高さ lineH とみなす（レーダーの座標の単位）。
 * dots はレーダーのすべての点の印（名前が印を隠さないように、その点以外の印にかかる名前は出さない）
 */
export function chooseRadarLabels(
  candidates: readonly RadarLabelCandidate[],
  max: number,
  dots: readonly { x: number; y: number }[] = [],
  charW = 0.09,
  lineH = 0.1,
  dotR = 0.035,
): Set<string> {
  const chosen = new Set<string>();
  const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const width = (s: string) => [...s].reduce((w, c) => w + (c.charCodeAt(0) < 0x100 ? charW * 0.55 : charW), 0);
  for (const c of [...candidates].sort((a, b) => a.priority - b.priority)) {
    if (chosen.size >= max) break;
    const box = { x0: c.x + 0.05, x1: c.x + 0.06 + width(c.label), y0: c.y - lineH / 2, y1: c.y + lineH / 2 };
    // レーダーの円の外にはみ出す名前は出さない
    if (Math.hypot(box.x1, c.y) > 1.1) continue;
    if (boxes.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) continue;
    const hitsDot = dots.some(
      (d) => (d.x !== c.x || d.y !== c.y) && d.x + dotR > box.x0 && d.x - dotR < box.x1 && d.y + dotR > box.y0 && d.y - dotR < box.y1,
    );
    if (hitsDot) continue;
    boxes.push(box);
    chosen.add(c.id);
  }
  return chosen;
}
