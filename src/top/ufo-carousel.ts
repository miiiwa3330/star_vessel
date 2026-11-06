/**
 * 宇宙船（UFO）を選ぶ、横に 3 つ並んだ列の計算（要件 F48）。純粋な関数にして、テストする（ufo-carousel.test.ts）。
 *
 * 3 つは輪になっている（右へ送り続けると、また最初の船が来る）。いつも真ん中の 1 つだけ大きく、左右の 2 つは小さい。
 * 位置 pos は小数で、整数のときに、その番号の船が真ん中に来る。pos は輪を何周してもよい（0 → 1 → 2 → 3 …）ので、
 * 「どの船か」は番号を 3 で割った余りで決める。滑らかに動かすため、pos は整数に落とさず、ばねで目標に近づける。
 */
import { HULL_TYPES, type HullType } from '../world/ship-design';

export const SLOT_COUNT = HULL_TYPES.length;

/** 隣の船との間隔（列の箱の幅に対する割合）。3D の船（ufo-layer.ts）と、押せる範囲（UfoPicker.tsx）が同じ数を使う */
export const SPACING_OF_WIDTH = 0.37;

/** 真ん中から 1 つ隣の船の大きさ（真ん中の船を 1 としたとき） */
export const SIDE_SCALE = 0.5;

/** 位置の差 d（輪の上で、船の番号 − pos）を、真ん中からの距離 [-1.5, 1.5) に収める */
export const wrapOffset = (d: number): number => d - SLOT_COUNT * Math.floor((d + SLOT_COUNT / 2) / SLOT_COUNT);

/** 目標の位置（整数。輪を何周してもよい）が指す船の番号 */
export const indexOfTarget = (target: number): number => ((Math.round(target) % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT;

export const hullOfTarget = (target: number): HullType => HULL_TYPES[indexOfTarget(target)];

/** 番号 index の船を真ん中に持ってくる目標のうち、いまの目標 current にいちばん近いもの（遠回りして回さない） */
export const targetForIndex = (index: number, current: number): number => Math.round(current) + wrapOffset(index - Math.round(current));

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * 真ん中から offset 離れた船の、大きさ（真ん中が 1）と不透明度。
 * 1 つ隣（|offset| = 1）で SIDE_SCALE。そこから 1.5 に向けて小さくなって消える。
 * 3 つの輪の「裏側」の船が、左端から右端へ飛んで見えないようにするため（|offset| = 1.5 で入れ替わる）
 */
export function slotLook(offset: number): { scale: number; alpha: number } {
  const a = Math.abs(offset);
  if (a <= 1) return { scale: 1 + (SIDE_SCALE - 1) * smoothstep(0, 1, a), alpha: 1 };
  const fade = 1 - smoothstep(1, 1.5, a);
  return { scale: SIDE_SCALE * fade, alpha: fade };
}

/** 臨界減衰のばね。overshoot せずに目標へ近づく。omega が大きいほど速い */
export function stepSpring(pos: number, vel: number, target: number, dt: number, omega: number): { pos: number; vel: number } {
  const x = pos - target;
  const e = Math.exp(-omega * dt);
  const k = (vel + omega * x) * dt;
  return { pos: target + (x + k) * e, vel: (vel - omega * k) * e };
}

/** ドラッグ中の位置。右へ引くと、船が右へ動く（= 左隣の船が真ん中へ来る）ので、pos は減る */
export const dragPosition = (startPos: number, dxPx: number, spacingPx: number): number => startPos - dxPx / Math.max(1, spacingPx);

/**
 * 指を離したときの目標（整数）。勢いがあれば先まで送るが、1 回の操作で送るのは、ドラッグを始めた位置 origin の隣までにする
 * （勢いのある 1 回の操作で、3 つを一周して元に戻らないように）。velocity は pos の変化（1 秒あたり）
 */
export function settleTarget(pos: number, velocity: number, origin: number): number {
  const from = Math.round(origin);
  const flick = Math.round(pos + velocity * 0.18);
  return Math.max(from - 1, Math.min(from + 1, flick));
}

/** 船の出入りの時間（ms）と、3 つの船の間の時間差 */
export const FLY_IN_MS = 1100;
export const FLY_OUT_MS = 700;
export const FLY_STAGGER_MS = 130;

/** 飛来：最初は光の速さのように速く、減速して止まる。offset：1 で画面の右の外、0 で到着。speed：最初が 1 で、止まるまでに 0 へ */
export function flyIn(p: number): { offset: number; speed: number } {
  const t = Math.min(1, Math.max(0, p));
  if (t >= 1) return { offset: 0, speed: 0 };
  return { offset: 2 ** (-10 * t) - 2 ** -10 * t, speed: 2 ** (-10 * t) };
}

/** 退場：ゆっくり動き出し、加速して左へ消える。offset：0 で元の場所、-1 で画面の左の外。speed：最後が 1 */
export function flyOut(p: number): { offset: number; speed: number } {
  const t = Math.min(1, Math.max(0, p));
  if (t <= 0) return { offset: 0, speed: 0 };
  return { offset: -(2 ** (10 * t - 10) - 2 ** -10 * (1 - t)), speed: 2 ** (10 * t - 10) };
}

export type UfoPhase = 'hidden' | 'in' | 'idle' | 'out';

/**
 * 船 1 つの、出入りの様子。rank：左から数えた順（0 が左端）。出るのも消えるのも、左の船から順に動く
 * （左端の船がいちばん遠くまで飛ぶので、先に出し、先に消す）。sinceMs：その段階が始まってからの時間
 */
export function ufoFlight(phase: UfoPhase, rank: number, sinceMs: number): { offset: number; speed: number; visible: boolean } {
  if (phase === 'hidden') return { offset: 0, speed: 0, visible: false };
  if (phase === 'idle') return { offset: 0, speed: 0, visible: true };
  const t = sinceMs - rank * FLY_STAGGER_MS;
  if (phase === 'in') {
    if (t < 0) return { offset: 1, speed: 0, visible: false };
    return { ...flyIn(t / FLY_IN_MS), visible: true };
  }
  const out = flyOut(t / FLY_OUT_MS);
  return { ...out, visible: t < FLY_OUT_MS };
}

/** 全部の船が出入りを終える時間（ms） */
export const flightDuration = (phase: 'in' | 'out'): number => (phase === 'in' ? FLY_IN_MS : FLY_OUT_MS) + (SLOT_COUNT - 1) * FLY_STAGGER_MS;
