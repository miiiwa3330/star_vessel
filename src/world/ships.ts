/**
 * 他のプレイヤーの宇宙船の計算：近い船を選ぶ（サーバー）、次の状態が届くまでの位置を予測する（ブラウザ）。
 * astronomy-engine を使う（基準の天体の位置を計算するため）。
 */
import { absolutePositionKm } from './observer';
import type { ShipSnapshot, ShipState } from './ship-schema';
import type { Vec3 } from './vec';

/** 予測する長さの上限（秒）。これより長く届かないときは、最後の位置で止めておく */
export const MAX_PREDICT_S = 2;

export const shipPositionKm = (s: ShipState, date: Date): Vec3 => absolutePositionKm(s, date);

/** 受け取った状態から nowMs（サーバーの時計）の位置を予測する。速度のまま進める */
export function predictShip(snap: ShipSnapshot, nowMs: number): ShipState {
  const dt = Math.min(MAX_PREDICT_S, Math.max(0, (nowMs - snap.at) / 1000));
  const { offsetKm: o, velocityKmS: v } = snap.s;
  return { ...snap.s, offsetKm: { x: o.x + v.x * dt, y: o.y + v.y * dt, z: o.z + v.z * dt } };
}

/**
 * from から近い順に max 個を選ぶ。positions は船ごとの位置（太陽中心・km）。
 * 自分自身（selfIndex）は除く。
 */
export function nearestIndices(from: Vec3, positions: readonly Vec3[], max: number, selfIndex = -1): number[] {
  const d = positions.map((p, i) => ({ i, d2: (p.x - from.x) ** 2 + (p.y - from.y) ** 2 + (p.z - from.z) ** 2 }));
  return d
    .filter((e) => e.i !== selfIndex)
    .sort((a, b) => a.d2 - b.d2)
    .slice(0, max)
    .map((e) => e.i);
}
