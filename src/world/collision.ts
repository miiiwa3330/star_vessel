/**
 * 天体に一定の距離より近づけないようにする（要件 F11）。
 * 決め方と理由は docs/tech/world-model.md の「天体に近づける距離」。
 */
import { allBodies, heliocentricPositionKm } from './solar-system';
import { absolutePositionKm, type Observer } from './observer';
import { add, length, scale, sub } from './vec';

/**
 * 表面からの最低の高さ（km）。100 km（地球の宇宙の境目とされる高さ）か、半径の 1% の大きい方。
 * ただし半径の半分より高くはしない（小さな天体に近づけるように。2026-11-05 から。半径 1 km の小惑星なら 0.5 km）
 */
export const minAltitudeKm = (radiusKm: number): number => Math.min(Math.max(100, radiusKm * 0.01), radiusKm * 0.5);

/** どの天体にも近づきすぎていない位置に押し戻す。近づきすぎていなければ、そのまま返す */
export function keepOutsideBodies(o: Observer, date: Date): Observer {
  let abs = absolutePositionKm(o, date);
  let moved = false;
  for (const body of allBodies()) {
    const center = heliocentricPositionKm(body.id, date);
    const rel = sub(abs, center);
    const d = length(rel);
    const minD = body.radiusKm + minAltitudeKm(body.radiusKm);
    if (d >= minD) continue;
    const dir = d > 0 ? scale(rel, 1 / d) : { x: 0, y: 0, z: 1 };
    abs = add(center, scale(dir, minD));
    moved = true;
  }
  if (!moved) return o;
  return { anchor: o.anchor, offsetKm: sub(abs, heliocentricPositionKm(o.anchor, date)) };
}
