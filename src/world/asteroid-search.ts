/**
 * 近くの小惑星を探す（要件 F21）。光の点として描いている小さな小惑星に近づいたとき、球として描き、住所も付けるため。
 * データは public/data/asteroids-*.bin（1 個につき 9 個の数：番号・H・a・e・i・Ω・ω・M・元期。docs/tech/small-bodies.md）。
 *
 * 90 万個すべての位置を毎回計算すると重いので、先に「太陽からの距離が近日点〜遠日点の範囲に入るか」で絞ってから、
 * 残ったものだけケプラーの方程式を解く。
 */
import { solveKepler } from './kepler';
import { KM_PER_AU } from './units';
import { mulVec, rotX, rotZ, mulMat, type Vec3 } from './vec';
import { ECLIPTIC_TO_EQJ } from './small-bodies';

export const ASTEROID_STRIDE = 9;
const GAUSS_K = 0.01720209895;
const J2000_MS = Date.UTC(2000, 0, 1, 12);

export interface NearbyAsteroid {
  number: number;
  H: number;
  aAu: number;
  e: number;
  iRad: number;
  nodeRad: number;
  periRad: number;
  /** epochDays での平均近点角 */
  meanAnomalyRad: number;
  /** 元期（J2000.0 からの日） */
  epochDays: number;
  distanceKm: number;
}

/**
 * J2000.0 から days 日のときの平均近点角を −π〜π に丸めたもの。
 * 光の点の計算（src/render/asteroid-field.ts）は GPU の 32 bit で行うので、0 に近い値にしておくと、細かく動ける
 */
export function meanAnomalyAtDays(meanAnomalyRad: number, aAu: number, epochDays: number, days: number): number {
  const m = meanAnomalyRad + (GAUSS_K / (aAu * Math.sqrt(aAu))) * (days - epochDays);
  const twoPi = 2 * Math.PI;
  return m - twoPi * Math.round(m / twoPi);
}

/** 1 個の小惑星の位置（太陽中心・EQJ・km） */
export function asteroidPositionKm(d: Float32Array, o: number, date: Date): Vec3 {
  const a = d[o + 2];
  const e = d[o + 3];
  const n = GAUSS_K / (a * Math.sqrt(a));
  const days = (date.getTime() - J2000_MS) / 86_400_000;
  const E = solveKepler(d[o + 7] + n * (days - d[o + 8]), e);
  const p = { x: a * (Math.cos(E) - e), y: a * Math.sqrt(1 - e * e) * Math.sin(E), z: 0 };
  const rot = mulMat(ECLIPTIC_TO_EQJ, mulMat(rotZ(d[o + 5]), mulMat(rotX(d[o + 4]), rotZ(d[o + 6]))));
  const v = mulVec(rot, p);
  return { x: v.x * KM_PER_AU, y: v.y * KM_PER_AU, z: v.z * KM_PER_AU };
}

/** 番号の小惑星を探す（遠くの小惑星に置かれたワープホールの位置などに使う）。無ければ null */
export function findAsteroidByNumber(chunks: readonly Float32Array[], number: number): NearbyAsteroid | null {
  for (const d of chunks) {
    for (let o = 0; o + ASTEROID_STRIDE <= d.length; o += ASTEROID_STRIDE) {
      if (d[o] !== number) continue;
      return {
        number,
        H: d[o + 1],
        aAu: d[o + 2],
        e: d[o + 3],
        iRad: d[o + 4],
        nodeRad: d[o + 5],
        periRad: d[o + 6],
        meanAnomalyRad: d[o + 7],
        epochDays: d[o + 8],
        distanceKm: Number.NaN,
      };
    }
  }
  return null;
}

/** observerKm（太陽中心・EQJ）から withinKm 以内の小惑星を、近い順に最大 max 個 */
export function findNearbyAsteroids(
  chunks: readonly Float32Array[],
  observerKm: Vec3,
  date: Date,
  withinKm: number,
  max: number,
): NearbyAsteroid[] {
  const rAu = Math.hypot(observerKm.x, observerKm.y, observerKm.z) / KM_PER_AU;
  const margin = withinKm / KM_PER_AU;
  const found: NearbyAsteroid[] = [];
  for (const d of chunks) {
    for (let o = 0; o + ASTEROID_STRIDE <= d.length; o += ASTEROID_STRIDE) {
      const a = d[o + 2];
      const e = d[o + 3];
      // 太陽からの距離は a(1−e)〜a(1+e)。その範囲に自分がいなければ、近くにはいない
      if (rAu < a * (1 - e) - margin || rAu > a * (1 + e) + margin) continue;
      const p = asteroidPositionKm(d, o, date);
      const dist = Math.hypot(p.x - observerKm.x, p.y - observerKm.y, p.z - observerKm.z);
      if (dist > withinKm) continue;
      found.push({
        number: d[o],
        H: d[o + 1],
        aAu: a,
        e,
        iRad: d[o + 4],
        nodeRad: d[o + 5],
        periRad: d[o + 6],
        meanAnomalyRad: d[o + 7],
        epochDays: d[o + 8],
        distanceKm: dist,
      });
    }
  }
  return found.sort((x, y) => x.distanceKm - y.distanceKm).slice(0, max);
}

/** 絶対等級 H から直径（km）を推定する。D = 1329 / √p × 10^(−H/5)、反射率 p は小惑星のおおよその平均 0.15 */
export const diameterFromH = (H: number, albedo = 0.15): number => (1329 / Math.sqrt(albedo)) * 10 ** (-H / 5);
