/**
 * 恒星の色（有効温度から）。planets.ts（恒星系の恒星）と compact-objects.ts（白色矮星）の両方から使うので、ここに分けた。
 * three.js・DOM を読み込まない
 */

/** 太陽の有効温度（K）。IAU 2015 の公称値 */
export const T_SUN_K = 5772;

/** 恒星の色（0〜1 の RGB）。有効温度からのおおよその色（見た目のための近似） */
export function starColor(teffK: number): [number, number, number] {
  const t = Math.min(40_000, Math.max(2_000, teffK)) / 100;
  const r = t <= 66 ? 255 : 329.7 * (t - 60) ** -0.1332;
  const g = t <= 66 ? 99.47 * Math.log(t) - 161.1 : 288.1 * (t - 60) ** -0.0755;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5 * Math.log(t - 10) - 305.0;
  const c = (v: number) => Math.min(1, Math.max(0, v / 255));
  return [c(r), c(g), c(b)];
}
