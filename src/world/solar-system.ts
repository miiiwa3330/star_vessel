/**
 * 太陽系の天体の「いま」の位置と向き。
 *
 * astronomy-engine はこのファイルの中だけで使う（AGENTS.md：計算ライブラリは自分たちの関数で包む）。
 * 座標系は J2000 の赤道座標系（EQJ）・太陽中心・単位 km。
 */
import { Body, HelioVector, RotationAxis } from 'astronomy-engine';
import { DEG, KM_PER_AU } from './units';
import { mulMat, rotX, rotZ, type Mat3, type Vec3 } from './vec';

export type BodyId =
  | 'Sun'
  | 'Mercury'
  | 'Venus'
  | 'Earth'
  | 'Moon'
  | 'Mars'
  | 'Jupiter'
  | 'Saturn'
  | 'Uranus'
  | 'Neptune'
  | 'Pluto';

export interface BodyInfo {
  id: BodyId;
  nameJa: string;
  /** 平均半径（km）。出典は docs/tech/world-model.md の「天体の大きさ」 */
  radiusKm: number;
}

export const BODIES: readonly BodyInfo[] = [
  { id: 'Sun', nameJa: '太陽', radiusKm: 695_700 },
  { id: 'Mercury', nameJa: '水星', radiusKm: 2_439.7 },
  { id: 'Venus', nameJa: '金星', radiusKm: 6_051.8 },
  { id: 'Earth', nameJa: '地球', radiusKm: 6_371.0 },
  { id: 'Moon', nameJa: '月', radiusKm: 1_737.4 },
  { id: 'Mars', nameJa: '火星', radiusKm: 3_389.5 },
  { id: 'Jupiter', nameJa: '木星', radiusKm: 69_911 },
  { id: 'Saturn', nameJa: '土星', radiusKm: 58_232 },
  { id: 'Uranus', nameJa: '天王星', radiusKm: 25_362 },
  { id: 'Neptune', nameJa: '海王星', radiusKm: 24_622 },
  { id: 'Pluto', nameJa: '冥王星', radiusKm: 1_188.3 },
];

export const bodyInfo = (id: BodyId): BodyInfo => {
  const info = BODIES.find((b) => b.id === id);
  if (!info) throw new Error(`unknown body: ${id}`);
  return info;
};

/** 太陽から見た天体の位置（km・EQJ）。光の届く時間の補正はしない（見た目には影響しない） */
export function heliocentricPositionKm(id: BodyId, date: Date): Vec3 {
  if (id === 'Sun') return { x: 0, y: 0, z: 0 };
  const v = HelioVector(Body[id], date);
  return { x: v.x * KM_PER_AU, y: v.y * KM_PER_AU, z: v.z * KM_PER_AU };
}

/**
 * 天体に固定した座標（x：本初子午線・y：東経90度・z：北極）を EQJ に移す回転行列。
 *
 * IAU（WGCCRE 2015）の定義どおり R = Rz(α0 + 90°) · Rx(90° − δ0) · Rz(W)。
 * α0・δ0 は北極の向き、W は本初子午線の回った角度で、どれも時刻から決まる。
 */
export function bodyFixedToEqj(id: BodyId, date: Date): Mat3 {
  const axis = RotationAxis(Body[id], date);
  const alpha = axis.ra * 15 * DEG;
  const delta = axis.dec * DEG;
  const w = axis.spin * DEG;
  return mulMat(rotZ(alpha + Math.PI / 2), mulMat(rotX(Math.PI / 2 - delta), rotZ(w)));
}
