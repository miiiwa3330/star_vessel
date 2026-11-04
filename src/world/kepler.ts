/**
 * ケプラーの軌道（楕円の軌道）で、親の天体のまわりの位置を時刻から計算する。
 * 系外惑星（要件 F5 と同じく、いまの時刻に合わせて公転させる）と、軌道の数で持つ衛星・小惑星に使う。
 *
 * 角度はラジアン、長さは km、時刻は UNIX ミリ秒。
 * 軌道の面の向きは Rz(Ω)·Rx(i)·Rz(ω) で基準の面に移し、frame で EQJ に移す。
 */
import { mulMat, mulVec, rotX, rotZ, type Mat3, type Vec3 } from './vec';

/** 万有引力定数 × 太陽の質量（km³/s²）。IAU 2015 の公称値 */
export const GM_SUN_KM3_S2 = 1.3271244e11;
const DAY_S = 86_400;
const DAY_MS = DAY_S * 1000;

export interface KeplerElements {
  /** 軌道長半径（km） */
  aKm: number;
  /** 離心率（0 以上 1 未満） */
  e: number;
  /** 軌道傾斜角 i */
  iRad: number;
  /** 昇交点の経度 Ω */
  nodeRad: number;
  /** 近点引数 ω */
  periRad: number;
  /** epochMs での平均近点角 M */
  meanAnomalyRad: number;
  epochMs: number;
  /** 公転周期（日） */
  periodDays: number;
  /** 基準の面（x・y が面、z が北）→ EQJ の回転 */
  frame: Mat3;
}

/** ケプラーの方程式 M = E − e·sin E を解く（離心近点角 E） */
export function solveKepler(meanAnomaly: number, e: number): number {
  const m = meanAnomaly - 2 * Math.PI * Math.floor(meanAnomaly / (2 * Math.PI));
  let E = e < 0.8 ? m : Math.PI;
  for (let k = 0; k < 30; k++) {
    const d = (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

/** 軌道の面 → EQJ の回転 */
export const orbitToEqj = (el: Pick<KeplerElements, 'nodeRad' | 'iRad' | 'periRad' | 'frame'>): Mat3 =>
  mulMat(el.frame, mulMat(rotZ(el.nodeRad), mulMat(rotX(el.iRad), rotZ(el.periRad))));

/** 親の天体の中心からの位置（km・EQJ） */
export function keplerPositionKm(el: KeplerElements, date: Date, rot = orbitToEqj(el)): Vec3 {
  const n = (2 * Math.PI) / (el.periodDays * DAY_MS);
  const M = el.meanAnomalyRad + n * (date.getTime() - el.epochMs);
  const E = solveKepler(M, el.e);
  const b = el.aKm * Math.sqrt(1 - el.e * el.e);
  const p = { x: el.aKm * (Math.cos(E) - el.e), y: b * Math.sin(E), z: 0 };
  return mulVec(rot, p);
}

/** 軌道の面の北（公転の向きに右ねじ）の向き（EQJ） */
export const orbitNormal = (el: Pick<KeplerElements, 'nodeRad' | 'iRad' | 'periRad' | 'frame'>): Vec3 =>
  mulVec(orbitToEqj(el), { x: 0, y: 0, z: 1 });

/** ケプラーの第 3 法則で、軌道長半径（km）と中心の質量（太陽質量）から周期（日）を出す */
export const periodDaysFromAxis = (aKm: number, massSun: number): number =>
  (2 * Math.PI * Math.sqrt(aKm ** 3 / (GM_SUN_KM3_S2 * massSun))) / DAY_S;

/** 周期（日）と中心の質量（太陽質量）から軌道長半径（km） */
export const axisKmFromPeriod = (periodDays: number, massSun: number): number =>
  Math.cbrt((GM_SUN_KM3_S2 * massSun * (periodDays * DAY_S) ** 2) / (4 * Math.PI ** 2));

/** 真近点角 f の位置にいるときの平均近点角 M */
export function meanAnomalyFromTrue(f: number, e: number): number {
  const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(f / 2), Math.sqrt(1 + e) * Math.cos(f / 2));
  return E - e * Math.sin(E);
}
