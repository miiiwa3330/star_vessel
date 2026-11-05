/**
 * タイトル画面の背景に出す、地球のまわりの船の計算（サーバー）。要件 F53。
 * 宇宙の部屋（太陽系）にいる船のうち、地球の近くにいるものを、地球の中心からの位置と速度にする。
 * 基準の天体は、船によって違う（地球・月・太陽など）。どれも太陽中心に直して、地球の位置を引く。
 * 形と確かめ方は earth-ships-schema.ts。
 */
import { type EarthShip, type EarthShipsSnapshot, MAX_SHOWCASE_SHIPS, SHOWCASE_RADIUS_KM } from './earth-ships-schema';
import type { ShipSnapshot } from './ship-schema';
import { SHIP_STALE_MS } from './ship-schema';
import { predictShip, shipPositionKm } from './ships';
import { heliocentricPositionKm } from './solar-system';
import { length, sub, type Vec3 } from './vec';

/** 速度を、この秒数ぶん先の位置との差から出す（基準の天体が動いていても、地球に対する速さになる） */
const VELOCITY_WINDOW_S = 1;

/**
 * 状態を nowMs まで予測し、さらに extraS 秒、速度のまま進めたときの、地球の中心からの船の位置（その時刻の地球から測る）。
 * 基準の天体がサーバーに分からない船は null
 */
function earthRelative(snap: ShipSnapshot, nowMs: number, extraS: number): Vec3 | null {
  try {
    const base = predictShip(snap, nowMs);
    const { offsetKm: o, velocityKmS: v } = base;
    const state = { ...base, offsetKm: { x: o.x + v.x * extraS, y: o.y + v.y * extraS, z: o.z + v.z * extraS } };
    const date = new Date(nowMs + extraS * 1000);
    return sub(shipPositionKm(state, date), heliocentricPositionKm('Earth', date));
  } catch {
    return null;
  }
}

/**
 * 状態が届いている船のうち、地球から SHOWCASE_RADIUS_KM 以内のものを、地球に近い順に MAX_SHOWCASE_SHIPS 隻まで返す。
 * 状態が古い（SHIP_STALE_MS を過ぎた）船と、位置が決まらない船は除く
 */
export function earthShips(snaps: readonly ShipSnapshot[], nowMs: number): EarthShipsSnapshot {
  const ships: (EarthShip & { distanceKm: number })[] = [];
  for (const snap of snaps) {
    if (nowMs - snap.at >= SHIP_STALE_MS) continue;
    const p0 = earthRelative(snap, nowMs, 0);
    const p1 = earthRelative(snap, nowMs, VELOCITY_WINDOW_S);
    if (!p0 || !p1) continue;
    const distanceKm = length(p0);
    if (!Number.isFinite(distanceKm) || distanceKm > SHOWCASE_RADIUS_KM) continue;
    const v = sub(p1, p0);
    ships.push({
      id: snap.id,
      hue: snap.hue,
      position: p0,
      velocity: { x: v.x / VELOCITY_WINDOW_S, y: v.y / VELOCITY_WINDOW_S, z: v.z / VELOCITY_WINDOW_S },
      distanceKm,
    });
  }
  ships.sort((a, b) => a.distanceKm - b.distanceKm);
  return { now: nowMs, ships: ships.slice(0, MAX_SHOWCASE_SHIPS).map(({ distanceKm: _d, ...s }) => s) };
}
