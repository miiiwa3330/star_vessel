/**
 * スマホの操縦の計算（2026-11-21。要件 F60）。画面の部品（src/ui/TouchPad.tsx）から切り離した、純粋な関数。
 *
 * - バーチャルパッド：指の位置（パッドの真ん中からのずれ。半径で割った値）から、押しているキー（前後左右）を決める。
 *   斜めにも動ける（8 方向）。端まで倒すと、前へ進んでいる間はダッシュ
 * - 速さのバー：上へスワイプすると速く、下へスワイプすると遅く。指を動かした距離（ピクセル）を、速さを変える段の数にする。
 *   バーのつまみの位置は、いまの速さを、下限から上限までの対数の割合にしたもの
 */

export type StickKey = 'KeyW' | 'KeyA' | 'KeyS' | 'KeyD' | 'ControlLeft';

/** パッドの真ん中のこの割合までは、動かない（指のぶれで動き出さないように） */
export const STICK_DEAD_ZONE = 0.22;
/** 斜めとみなす向きの成分（この割合を超えた向きのキーを押す。8 方向の境目が 22.5 度ずつになる値：sin 22.5°） */
const AXIS_THRESHOLD = 0.383;
/** この割合より外まで倒すと、ダッシュ */
export const STICK_SPRINT = 0.92;

/**
 * 指のずれ（x：右が正、y：下が正。どちらもパッドの半径で割った値）から、押しているキーの一覧。
 * 半径より外へ出ても、向きだけを使う
 */
export function stickKeys(x: number, y: number): Set<StickKey> {
  const keys = new Set<StickKey>();
  const len = Math.hypot(x, y);
  if (len < STICK_DEAD_ZONE) return keys;
  const ux = x / len;
  const uy = y / len;
  if (uy < -AXIS_THRESHOLD) keys.add('KeyW');
  if (uy > AXIS_THRESHOLD) keys.add('KeyS');
  if (ux > AXIS_THRESHOLD) keys.add('KeyD');
  if (ux < -AXIS_THRESHOLD) keys.add('KeyA');
  if (len >= STICK_SPRINT && keys.has('KeyW')) keys.add('ControlLeft');
  return keys;
}

/** つまみを描く位置（パッドの半径で割った値）。半径より外へは出さない */
export function stickKnob(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  return len <= 1 ? { x, y } : { x: x / len, y: y / len };
}

/**
 * 速さのバーを、何ピクセル動かすと 1 段（1.25 倍）変わるか。1 回のスワイプ（約 200 px）で 33 段（約 1,600 倍）。
 * 下限（秒速 1 m）から上限（秒速 1,000 光年）までは約 196 段なので、端から端まで約 6 回のスワイプ
 */
export const SPEED_PX_PER_STEP = 6;

/**
 * 指を動かした量から、速さを変える段の数と、使いきれずに残った量。
 * dyPx は上へ動かすと負（画面の座標）。上へ動かすと速く（段の数が正）
 */
export function speedSteps(carryPx: number, dyPx: number): { steps: number; carryPx: number } {
  const total = carryPx - dyPx;
  const steps = Math.trunc(total / SPEED_PX_PER_STEP);
  return { steps, carryPx: total - steps * SPEED_PX_PER_STEP };
}

/** いまの速さの、下限から上限までの対数の割合（0：下限、1：上限） */
export function speedFraction(speedKmS: number, minKmS: number, maxKmS: number): number {
  const f = Math.log(speedKmS / minKmS) / Math.log(maxKmS / minKmS);
  return Math.min(1, Math.max(0, f));
}
