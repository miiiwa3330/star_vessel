/**
 * スキャン（訪れた判定。2026-11-22 にオーナーの指示）の計算。three.js・React を読み込まない。
 *
 * - 天体に近づき（スキャンできる範囲）、その天体を押すとスキャンが始まる。終わるとコレクションに記録する（＝訪れた）
 * - スキャンの間に視点を変える（向きを変える・視点を切り替える）か、範囲の外へ出ると失敗
 * - 決まりは docs/product/scan.md
 */
import { bodyInfo } from './solar-system';
import { add, length, normalize, scale, sub, type Vec3 } from './vec';

/** スキャンにかかる時間（ミリ秒。仮） */
export const SCAN_MS = 3_000;
/** 終わったあと・失敗したあとに SUCCESS・FAILURE を出しておく時間（ミリ秒。仮） */
export const SCAN_RESULT_MS = 3_000;
/** 地球をスキャンできる距離（中心から km。2026-11-22 にオーナーが決めた） */
export const EARTH_SCAN_RANGE_KM = 30_000;
/**
 * スキャンできる距離は、天体の大きさに比例する（2026-11-22 にオーナーの指示）：中心から半径の何倍まで（約 4.7 倍）。
 * どの天体も、範囲のふちでは同じ大きさ（地球を 3 万 km から見た大きさ。見かけの直径 約 25 度）に見えるので、
 * 大きな天体でも画面に全体を収めてスキャンできる（画角は縦 60 度）
 */
export const SCAN_RANGE_RADII = EARTH_SCAN_RANGE_KM / bodyInfo('Earth').radiusKm;
/** スキャンの間に、見ている向きがこの角度より動くと失敗（度。仮。マウスの小さな揺れでは失敗にしない） */
export const SCAN_VIEW_TOLERANCE_DEG = 2;

/** スキャンできる、天体の中心からの距離（km） */
export const scanRangeKm = (radiusKm: number): number => radiusKm * SCAN_RANGE_RADII;

/** 天体がスキャンできる範囲にあるか。半径の分からないもの（星団・星雲・銀河など）はスキャンしない */
export function inScanRange(target: { positionKm: Vec3; radiusKm?: number }, observerKm: Vec3): boolean {
  if (!target.radiusKm || target.radiusKm <= 0) return false;
  return length(sub(target.positionKm, observerKm)) <= scanRangeKm(target.radiusKm);
}

/** 範囲にある天体のうち、表面がいちばん近いもの。無ければ null */
export function nearestScannable<T extends { positionKm: Vec3; radiusKm?: number }>(targets: readonly T[], observerKm: Vec3): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const t of targets) {
    if (!inScanRange(t, observerKm)) continue;
    const d = length(sub(t.positionKm, observerKm)) - (t.radiusKm ?? 0);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/** 2 つの向き（単位ベクトル）の間の角度（度） */
export function angleDeg(a: Vec3, b: Vec3): number {
  const d = (a.x * b.x + a.y * b.y + a.z * b.z) / (length(a) * length(b));
  return (Math.acos(Math.min(1, Math.max(-1, d))) * 180) / Math.PI;
}

/** already：スキャンは終わったが、もうコレクションにある天体だった（2026-11-22） */
export type ScanPhase = 'idle' | 'scanning' | 'success' | 'already' | 'failure';

export type ScanState =
  | { phase: 'idle' }
  | { phase: 'scanning'; key: string; startMs: number; forward: Vec3; view: string }
  | { phase: 'success' | 'already' | 'failure'; key: string; untilMs: number };

export const SCAN_IDLE: ScanState = { phase: 'idle' };

/** スキャンを始める。スキャンの最中なら、そのまま（ほかの天体を押しても、いまのスキャンを続ける） */
export function startScan(s: ScanState, key: string, nowMs: number, forward: Vec3, view: string): ScanState {
  if (s.phase === 'scanning') return s;
  return { phase: 'scanning', key, startMs: nowMs, forward, view };
}

/** スキャンの進み具合（0〜1）。スキャンの最中でなければ 0 */
export const scanProgress = (s: ScanState, nowMs: number): number =>
  s.phase === 'scanning' ? Math.min(1, Math.max(0, (nowMs - s.startMs) / SCAN_MS)) : 0;

export interface ScanInput {
  nowMs: number;
  /** いま見ている向き（カメラの前。単位ベクトル） */
  forward: Vec3;
  /** いまの視点（一人称・後ろから・前から） */
  view: string;
  /** スキャンしている天体が、まだ範囲にあるか（見失ったら false） */
  inRange: boolean;
}

/** 1 フレーム進める。event：このフレームで終わった（success）・失敗した（failure） */
export function stepScan(s: ScanState, i: ScanInput): { state: ScanState; event: 'success' | 'failure' | null } {
  if (s.phase === 'idle') return { state: s, event: null };
  if (s.phase !== 'scanning') return { state: i.nowMs >= s.untilMs ? SCAN_IDLE : s, event: null };
  if (i.view !== s.view || !i.inRange || angleDeg(i.forward, s.forward) > SCAN_VIEW_TOLERANCE_DEG) {
    return { state: { phase: 'failure', key: s.key, untilMs: i.nowMs + SCAN_RESULT_MS }, event: 'failure' };
  }
  if (i.nowMs - s.startMs >= SCAN_MS) {
    return { state: { phase: 'success', key: s.key, untilMs: i.nowMs + SCAN_RESULT_MS }, event: 'success' };
  }
  return { state: s, event: null };
}

/** 終わったスキャンを「もうコレクションにあった」にする（SUCCESS の代わりに ALREADY を出す。出す時間は同じ） */
export const markAlready = (s: ScanState): ScanState => (s.phase === 'success' ? { ...s, phase: 'already' } : s);

/**
 * スキャンの光が天体の表面をなぞる線（UFO から見える側の、横の弧）。
 * origin：UFO の位置、center・radiusKm：天体、up：上の向き（画面の上。視線と直交していなくてよい）、
 * progress：0 で上の端、1 で下の端。n：点の数。見えている部分が無ければ空の配列
 */
export function scanArc(origin: Vec3, center: Vec3, radiusKm: number, up: Vec3, progress: number, n: number): Vec3[] {
  const toObs = sub(origin, center);
  const dist = length(toObs);
  if (dist <= radiusKm || n < 2) return [];
  const w = scale(toObs, 1 / dist);
  // 上の向きを、視線と直交させる（視線と平行なら、別の向きを使う）
  let u = sub(up, scale(w, up.x * w.x + up.y * w.y + up.z * w.z));
  if (length(u) < 1e-9) u = Math.abs(w.z) < 0.9 ? sub({ x: 0, y: 0, z: 1 }, scale(w, w.z)) : sub({ x: 1, y: 0, z: 0 }, scale(w, w.x));
  u = normalize(u);
  const v = { x: u.y * w.z - u.z * w.y, y: u.z * w.x - u.x * w.z, z: u.x * w.y - u.y * w.x };
  // 見えているのは、視線の向きの成分が R²/D より大きい所（縁の向こうは天体に隠れる）
  const horizon = (radiusKm * radiusKm) / dist;
  // 見えている円の上の端。端ちょうどは弧が点になるので、少し内側から始める
  const topY = Math.sqrt(radiusKm * radiusKm - horizon * horizon) * 0.98;
  const y = topY * (1 - 2 * Math.min(1, Math.max(0, progress)));
  const r = Math.sqrt(Math.max(0, radiusKm * radiusKm - y * y));
  if (r <= horizon) return [];
  const from = Math.asin(horizon / r);
  const to = Math.PI - from;
  // 表面とぴったり重なると見えにくいので、少しだけ外に出す
  const lift = 1.004;
  const out: Vec3[] = [];
  for (let k = 0; k < n; k++) {
    const th = from + ((to - from) * k) / (n - 1);
    const p = add(scale(u, y), add(scale(v, r * Math.cos(th)), scale(w, r * Math.sin(th))));
    out.push(add(center, scale(p, lift)));
  }
  return out;
}
