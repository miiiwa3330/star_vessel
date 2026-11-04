/**
 * 自分（観測者・自分の宇宙船）の位置。
 *
 * 位置は「いちばん近くで引っぱっている天体（基準の天体）からの相対位置」で持つ。
 * 地球は太陽のまわりを秒速約 30 km で回っているので、太陽を基準にしたままだと、
 * 止まっているつもりでも地球が離れていく。基準の天体と一緒に動くことで、それを防ぐ。
 * 理由と決め方は docs/tech/world-model.md の「自分の位置の持ち方」。
 * 基準にする範囲（影響圏）は、天体ごとに src/world/solar-system.ts の anchorRadiusKm に持つ。
 */
import { allBodies, heliocentricPositionKm, type BodyId } from './solar-system';
import { add, length, normalize, scale, sub, type Vec3 } from './vec';

export interface Observer {
  /** 基準の天体 */
  anchor: BodyId;
  /** 基準の天体の中心からの位置（km・EQJ） */
  offsetKm: Vec3;
}

export const absolutePositionKm = (o: Observer, date: Date): Vec3 =>
  add(heliocentricPositionKm(o.anchor, date), o.offsetKm);

export const moveBy = (o: Observer, deltaKm: Vec3): Observer => ({
  anchor: o.anchor,
  offsetKm: add(o.offsetKm, deltaKm),
});

/** いまの位置で基準の天体を選び直す。位置そのものは変えない */
export function reanchor(o: Observer, date: Date): Observer {
  const abs = absolutePositionKm(o, date);
  let best: BodyId = 'Sun';
  let bestRadius = Number.POSITIVE_INFINITY;
  for (const b of allBodies()) {
    const radius = b.anchorRadiusKm;
    if (radius === undefined || radius >= bestRadius) continue;
    if (length(sub(abs, heliocentricPositionKm(b.id, date))) < radius) {
      best = b.id;
      bestRadius = radius;
    }
  }
  if (best === o.anchor) return o;
  return { anchor: best, offsetKm: sub(abs, heliocentricPositionKm(best, date)) };
}

/** 出発点：地球の昼の側、地球の中心から distanceKm 離れたところ（全員が地球から出発する） */
export function startObserver(date: Date, distanceKm = 20_000): Observer {
  const towardSun = normalize(scale(heliocentricPositionKm('Earth', date), -1));
  return { anchor: 'Earth', offsetKm: scale(towardSun, distanceKm) };
}
