/**
 * マインクラフト（クリエイティブの飛行）に似せた動き方の計算。three.js も画面も使わない純粋な関数。
 *
 * - W/S・A/D は、いま見ている向き（視点の前後・左右）にそのまま進む
 * - Space で上昇、Shift で下降（いま見ている視点の上下＝カメラの +Y / −Y に沿って）
 * - キーを離すと、少し滑ってから止まる（慣性）。上下は早く止まる
 * - W を 2 回すばやく押すか、Ctrl を押しながら進むとダッシュ（前へ進むのをやめるまで続く）
 *
 * 数の元：マインクラフト Java 版の飛行は、1 tick（1/20 秒）ごとに水平の速さを 0.91 倍、上下の速さを 0.6 倍にする。
 * 時間の定数にすると、前後左右 0.05 / −ln(0.91) ≈ 0.53 秒、上下 0.05 / −ln(0.6) ≈ 0.10 秒。
 * 飛行中のダッシュは、ふつうの 2 倍の速さ。W の 2 回押しは 7 tick（0.35 秒）以内。
 * これらは遊びの感触を真似るための値で、宇宙の実際とは関係ない（宇宙には空気の抵抗は無い）。
 */
import type { Vec3 } from '../world/vec';

/** 前後・左右の速さが、目標の速さに近づく時間の定数（秒） */
export const HORIZONTAL_TAU_S = 0.53;
/** 上下の速さが、目標の速さに近づく時間の定数（秒） */
export const VERTICAL_TAU_S = 0.1;
/** ダッシュの速さの倍率 */
export const SPRINT_FACTOR = 2;
/** W を 2 回押したとみなす間隔（ミリ秒） */
export const DOUBLE_TAP_MS = 350;

/** 押しているキー（KeyboardEvent.code）から、前後・左右・上下の操作を返す（それぞれ +1・0・−1） */
export interface MoveInput {
  /** +1 前（W）、−1 後ろ（S） */
  forward: number;
  /** +1 右（D）、−1 左（A） */
  right: number;
  /** +1 上昇（Space）、−1 下降（Shift） */
  up: number;
}

const has = (keys: ReadonlySet<string>, ...codes: string[]) => codes.some((c) => keys.has(c));

/** 上下の操作（+1 上昇、−1 下降、0 動かない）。Space で上昇、Shift で下降。両方押すと打ち消す */
export function verticalInput(keys: ReadonlySet<string>): number {
  return (has(keys, 'Space') ? 1 : 0) - (has(keys, 'ShiftLeft', 'ShiftRight') ? 1 : 0);
}

export function moveInput(keys: ReadonlySet<string>): MoveInput {
  return {
    forward: (has(keys, 'KeyW') ? 1 : 0) - (has(keys, 'KeyS') ? 1 : 0),
    right: (has(keys, 'KeyD') ? 1 : 0) - (has(keys, 'KeyA') ? 1 : 0),
    up: verticalInput(keys),
  };
}

/**
 * ダッシュの次の状態。ダッシュは、W の 2 回押しか、Ctrl を押しながら前へ進むと始まり、前へ進むのをやめると終わる
 * （Ctrl は離しても、前へ進んでいる間は続く）
 */
export function nextSprint(sprinting: boolean, input: MoveInput, ctrl: boolean, doubleTapped: boolean): boolean {
  if (input.forward <= 0) return false;
  return sprinting || ctrl || doubleTapped;
}

/** 前に W を押した時刻（ミリ秒）から、今回の押し方が 2 回押しか */
export function isDoubleTap(lastPressMs: number, nowMs: number): boolean {
  const gap = nowMs - lastPressMs;
  return gap > 0 && gap <= DOUBLE_TAP_MS;
}

/**
 * いまの速度 v を、目標の速度 target へ dt 秒ぶん近づける（km/s・EQJ）。up は視点の上の向き（単位ベクトル）。
 * 上下（up に沿った成分）は VERTICAL_TAU_S、前後左右は HORIZONTAL_TAU_S で近づく
 */
export function approachVelocity(v: Vec3, target: Vec3, up: Vec3, dt: number): Vec3 {
  const dx = v.x - target.x;
  const dy = v.y - target.y;
  const dz = v.z - target.z;
  const along = dx * up.x + dy * up.y + dz * up.z;
  const kh = Math.exp(-dt / HORIZONTAL_TAU_S);
  const kv = Math.exp(-dt / VERTICAL_TAU_S);
  const hx = dx - along * up.x;
  const hy = dy - along * up.y;
  const hz = dz - along * up.z;
  return {
    x: target.x + hx * kh + along * up.x * kv,
    y: target.y + hy * kh + along * up.y * kv,
    z: target.z + hz * kh + along * up.z * kv,
  };
}

/** 止まろうとしていて、速さが stopKmS より遅くなったら、ちょうど止める（いつまでも少しずつ動き続けないように） */
export function settle(v: Vec3, target: Vec3, stopKmS: number): Vec3 {
  const stopping = target.x === 0 && target.y === 0 && target.z === 0;
  return stopping && Math.hypot(v.x, v.y, v.z) < stopKmS ? { x: 0, y: 0, z: 0 } : v;
}
