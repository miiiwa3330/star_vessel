import { KM_PER_AU, KM_PER_LY } from '../world/units';

/** 3 桁で丸める。1,000 以上は 2.45e+3 ではなく 2,450 と書く */
const three = (n: number): string => (Math.abs(n) < 1000 ? n.toPrecision(3) : Number(n.toPrecision(3)).toLocaleString('ja-JP'));

/** 距離を、大きさに合った単位で表す */
export function formatDistance(km: number): string {
  const a = Math.abs(km);
  if (a < 1e6) return `${Math.round(km).toLocaleString('ja-JP')} km`;
  if (a < 0.1 * KM_PER_LY) return `${three(km / KM_PER_AU)} 天文単位`;
  return `${three(km / KM_PER_LY)} 光年`;
}

/** 速さを、大きさに合った単位で表す（1 秒あたり） */
export function formatSpeed(kmS: number): string {
  const d = formatDistance(kmS);
  return `秒速 ${d}`;
}

/**
 * 地球を原点にした座標（要件 F39）。3 つの軸で単位をそろえるため、原点からの距離で単位を決める
 * （km・天文単位・光年。formatDistance と同じ切り替え方）。例：「X +1.23 Y −0.45 Z +0.10 天文単位」
 */
export function formatCoordinates(v: { x: number; y: number; z: number }): { x: string; y: string; z: string; unit: string } {
  const r = Math.hypot(v.x, v.y, v.z);
  const sign = (n: string) => (n.startsWith('-') ? `−${n.slice(1)}` : `+${n}`);
  if (r < 1e6) {
    const f = (n: number) => sign(Math.round(n).toLocaleString('ja-JP'));
    return { x: f(v.x), y: f(v.y), z: f(v.z), unit: 'km' };
  }
  const [div, unit] = r < 0.1 * KM_PER_LY ? [KM_PER_AU, '天文単位'] : [KM_PER_LY, '光年'];
  // 大きさに合わせて小数の桁を決める（3 桁くらい読めるように）
  const digits = Math.max(0, 2 - Math.floor(Math.log10(r / div)));
  const f = (n: number) => sign((n / div).toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  return { x: f(v.x), y: f(v.y), z: f(v.z), unit };
}
