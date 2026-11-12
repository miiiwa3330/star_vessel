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

/** 距離を、英語の単位で表す（左上の表示。2026-11-12 から英語。km・AU・ly の切り替えは formatDistance と同じ） */
export function formatDistanceEn(km: number): string {
  const a = Math.abs(km);
  const en = (n: number) => (Math.abs(n) < 1000 ? n.toPrecision(3) : Number(n.toPrecision(3)).toLocaleString('en-US'));
  if (a < 1e6) return `${Math.round(km).toLocaleString('en-US')} km`;
  if (a < 0.1 * KM_PER_LY) return `${en(km / KM_PER_AU)} AU`;
  return `${en(km / KM_PER_LY)} ly`;
}

/** 速さを、大きさに合った単位で表す（1 秒あたり。左上の表示なので英語） */
export function formatSpeed(kmS: number): string {
  return `${formatDistanceEn(kmS)}/s`;
}

/**
 * 地球を原点にした座標（要件 F39）。3 つの軸で単位をそろえるため、原点からの距離で単位を決める
 * （km・AU・ly。formatDistance と同じ切り替え方。左上の表示なので英語）。例：「X +1.23 Y −0.45 Z +0.10 AU」
 */
export function formatCoordinates(v: { x: number; y: number; z: number }): { x: string; y: string; z: string; unit: string } {
  const r = Math.hypot(v.x, v.y, v.z);
  const sign = (n: string) => (n.startsWith('-') ? `−${n.slice(1)}` : `+${n}`);
  if (r < 1e6) {
    const f = (n: number) => sign(Math.round(n).toLocaleString('en-US'));
    return { x: f(v.x), y: f(v.y), z: f(v.z), unit: 'km' };
  }
  const [div, unit] = r < 0.1 * KM_PER_LY ? [KM_PER_AU, 'AU'] : [KM_PER_LY, 'ly'];
  // 大きさに合わせて小数の桁を決める（3 桁くらい読めるように）
  const digits = Math.max(0, 2 - Math.floor(Math.log10(r / div)));
  const f = (n: number) => sign((n / div).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  return { x: f(v.x), y: f(v.y), z: f(v.z), unit };
}
