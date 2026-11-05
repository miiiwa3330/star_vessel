/**
 * 地球のまわりの船（サーバーの /api/earth-ships。worker/showcase.ts）。要件 F53。タイトル画面の背景に使う。
 * 読めない・形が正しくないときは null（背景は、船なしで続ける）
 */
import { type EarthShipsSnapshot, isEarthShipsSnapshot } from '../world/earth-ships-schema';

export async function fetchEarthShips(): Promise<EarthShipsSnapshot | null> {
  try {
    const res = await fetch('/api/earth-ships');
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return isEarthShipsSnapshot(body) ? body : null;
  } catch {
    return null;
  }
}
