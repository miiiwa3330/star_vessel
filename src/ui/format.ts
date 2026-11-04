import { KM_PER_AU, KM_PER_LY } from '../world/units';

/** 距離を、大きさに合った単位で表す */
export function formatDistance(km: number): string {
  const a = Math.abs(km);
  if (a < 1e6) return `${Math.round(km).toLocaleString('ja-JP')} km`;
  if (a < 0.1 * KM_PER_LY) return `${(km / KM_PER_AU).toPrecision(3)} 天文単位`;
  return `${(km / KM_PER_LY).toPrecision(3)} 光年`;
}

/** 速さを、大きさに合った単位で表す（1 秒あたり） */
export function formatSpeed(kmS: number): string {
  const d = formatDistance(kmS);
  return `秒速 ${d}`;
}
