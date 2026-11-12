/**
 * 3D のマップ（要件 F62。2026-11-12 にオーナーの指示）。訪れた場所だけが出る（訪れるほど少しずつ解放される）。
 * three.js・DOM を読み込まない純粋な計算。描くのは src/ui/StarMap.tsx（2D の canvas に、ここで投影した点を描く）。
 *
 * - 宇宙の大きさは 15 桁以上あるので、**中心（いま見ている所）からの距離を対数で縮める**：r = log10(1 + d / MAP_UNIT_KM)。
 *   向きはそのまま。中心にした場所のまわりほど細かく見え、遠くはまとめて小さくなる（月も地球も、銀河も、同じ画面に入る）
 * - 平面（目盛りの円と、点から下ろす線）は黄道面。太陽系の惑星が平らに並ぶので、はじめに訪れる場所が読みやすい
 * - 見る向きは、中心のまわりを回るカメラ（yaw・pitch）と、中心からの距離
 */
import { ECLIPTIC_TO_EQJ } from './small-bodies';
import { length, mulVec, sub, transpose, type Vec3 } from './vec';

/** 対数で縮める単位（km）。これより近いものは、ほぼ距離に比例する */
export const MAP_UNIT_KM = 1e4;
const EQJ_TO_ECLIPTIC = transpose(ECLIPTIC_TO_EQJ);

/** 中心からの距離（km）を、マップの上の半径にする */
export const mapRadius = (km: number): number => Math.log10(1 + Math.max(0, km) / MAP_UNIT_KM);

/** 太陽中心の位置（EQJ・km）を、中心（focusKm）からのマップの上の位置（黄道の座標。z が黄道の北）にする */
export function mapPosition(positionKm: Vec3, focusKm: Vec3): Vec3 {
  const rel = sub(positionKm, focusKm);
  const d = length(rel);
  if (d === 0) return { x: 0, y: 0, z: 0 };
  const e = mulVec(EQJ_TO_ECLIPTIC, rel);
  const k = mapRadius(d) / d;
  return { x: e.x * k, y: e.y * k, z: e.z * k };
}

/** カメラ：中心のまわりを回る。yaw は黄道面の上の向き、pitch は黄道面からの高さ（ラジアン）、distance は中心からの距離（マップの単位） */
export interface MapView {
  yaw: number;
  pitch: number;
  distance: number;
}

export const MAP_PITCH_LIMIT = (85 * Math.PI) / 180;
export const MAP_DISTANCE_LIMITS = { min: 1.5, max: 60 } as const;
/** カメラの画角（縦・度） */
export const MAP_FOV_DEG = 50;

export const clampMapView = (v: MapView): MapView => ({
  yaw: v.yaw,
  pitch: Math.min(MAP_PITCH_LIMIT, Math.max(-MAP_PITCH_LIMIT, v.pitch)),
  distance: Math.min(MAP_DISTANCE_LIMITS.max, Math.max(MAP_DISTANCE_LIMITS.min, v.distance)),
});

export interface Projected {
  x: number;
  y: number;
  /** カメラからの奥行き（マップの単位）。遠いほど大きい */
  depth: number;
  /** カメラの前にあるか */
  visible: boolean;
}

/** 投影の準備（毎フレーム 1 回作り、点ごとに使い回す） */
export function mapCamera(view: MapView, width: number, height: number) {
  const cp = Math.cos(view.pitch);
  const cam = { x: view.distance * cp * Math.cos(view.yaw), y: view.distance * cp * Math.sin(view.yaw), z: view.distance * Math.sin(view.pitch) };
  // 前（中心の方）・右・上
  const f = { x: -cam.x / view.distance, y: -cam.y / view.distance, z: -cam.z / view.distance };
  const rl = Math.hypot(f.y, f.x) || 1;
  const r = { x: f.y / rl, y: -f.x / rl, z: 0 };
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
  const focal = height / 2 / Math.tan((MAP_FOV_DEG * Math.PI) / 360);
  return (p: Vec3): Projected => {
    const dx = p.x - cam.x;
    const dy = p.y - cam.y;
    const dz = p.z - cam.z;
    const zc = dx * f.x + dy * f.y + dz * f.z;
    const xc = dx * r.x + dy * r.y + dz * r.z;
    const yc = dx * u.x + dy * u.y + dz * u.z;
    if (zc <= 0.05) return { x: 0, y: 0, depth: zc, visible: false };
    return { x: width / 2 + (xc / zc) * focal, y: height / 2 - (yc / zc) * focal, depth: zc, visible: true };
  };
}

/** 目盛りの円の距離（km）。半径はほぼ 2 ずつ（10 万 km・1 天文単位・100 天文単位・1 光年・100 光年・1 万光年・100 万光年・1 億光年） */
export const MAP_RING_KM: readonly number[] = [1e5, 1.495978707e8, 1.495978707e10, 9.4607e12, 9.4607e14, 9.4607e16, 9.4607e18, 9.4607e20];

/** 出す目盛りの円：いちばん遠い点の外側の 1 本まで */
export function mapRings(maxRadius: number): { km: number; r: number }[] {
  const out: { km: number; r: number }[] = [];
  for (const km of MAP_RING_KM) {
    const r = mapRadius(km);
    out.push({ km, r });
    if (r > maxRadius) break;
  }
  return out;
}

/** 全部の点が入るカメラの距離 */
export function fitMapDistance(maxRadius: number): number {
  const half = (MAP_FOV_DEG * Math.PI) / 360;
  return Math.min(MAP_DISTANCE_LIMITS.max, Math.max(MAP_DISTANCE_LIMITS.min, (Math.max(maxRadius, 1) / Math.sin(half)) * 1.15));
}
