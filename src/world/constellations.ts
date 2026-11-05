/**
 * 星座（要件 F40）。線の両端は本物の星（HYG）なので、線は本物の 3 次元の位置を結ぶ。
 * 地球のそばからは星座の形に見え、遠くへ行くと形が崩れていくのが見える。
 * データは public/data/constellations.json（tools/build-constellations.mjs）。決まりは docs/tech/constellations.md。
 * three.js・DOM を読み込まない。
 */
import { type Vec3 } from './vec';

export interface Constellation {
  /** IAU の略号（例：Ori） */
  id: string;
  nameJa: string;
  nameEn: string;
  /** 線。両端の星の HYG の id */
  lines: readonly (readonly [number, number])[];
}

export const decodeConstellations = (json: { constellations: Constellation[] }): Constellation[] => json.constellations;

/** 線の位置（pc）。positions は 1 本につき 6 個（x・y・z を 2 点）。ranges は星座ごとの線の範囲 */
export interface ConstellationSegments {
  positions: Float32Array;
  ranges: { constellation: Constellation; start: number; count: number }[];
}

/**
 * 星座の線を、星のデータの今の位置で作る。stars は stride 個ずつ並んだ星のデータ（x・y・z が先頭、stride−1 番目が HYG の id）。
 * 星のデータに無い星の線は描かない
 */
export function constellationSegments(list: readonly Constellation[], stars: Float32Array, stride: number): ConstellationSegments {
  const offsetOf = new Map<number, number>();
  for (let o = 0; o + stride <= stars.length; o += stride) offsetOf.set(stars[o + stride - 1], o);
  const out: number[] = [];
  const ranges: ConstellationSegments['ranges'] = [];
  for (const c of list) {
    const start = out.length / 6;
    for (const [a, b] of c.lines) {
      const oa = offsetOf.get(a);
      const ob = offsetOf.get(b);
      if (oa === undefined || ob === undefined) continue;
      out.push(stars[oa], stars[oa + 1], stars[oa + 2], stars[ob], stars[ob + 1], stars[ob + 2]);
    }
    ranges.push({ constellation: c, start, count: out.length / 6 - start });
  }
  return { positions: new Float32Array(out), ranges };
}

const normalized = (x: number, y: number, z: number): Vec3 | null => {
  const d = Math.hypot(x, y, z);
  return d > 0 ? { x: x / d, y: y / d, z: z / d } : null;
};
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const angleBetween = (a: Vec3, b: Vec3) => Math.acos(Math.min(1, Math.max(-1, dot(a, b))));

/**
 * 自分の位置から見て、向き forward（単位ベクトル）の先の星座。線のいちばん近いところまでの角度が maxDeg 以内で、いちばん小さいもの。
 * 位置から見た線で比べるので、どこにいても見えている線のとおりに選ばれる
 */
export function constellationAt(seg: ConstellationSegments, observerPc: Vec3, forward: Vec3, maxDeg = 6): Constellation | null {
  const p = seg.positions;
  let best: Constellation | null = null;
  let bestAngle = (maxDeg * Math.PI) / 180;
  for (const r of seg.ranges) {
    for (let i = r.start; i < r.start + r.count; i++) {
      const o = i * 6;
      const a = normalized(p[o] - observerPc.x, p[o + 1] - observerPc.y, p[o + 2] - observerPc.z);
      const b = normalized(p[o + 3] - observerPc.x, p[o + 4] - observerPc.y, p[o + 5] - observerPc.z);
      if (!a || !b) continue;
      let angle = Math.min(angleBetween(forward, a), angleBetween(forward, b));
      // 2 つの星を通る大円までの角度。見ている向きが 2 つの星の間にあるときは、そちらを使う
      const n = normalized(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
      if (n) {
        const d = dot(forward, n);
        const proj = normalized(forward.x - d * n.x, forward.y - d * n.y, forward.z - d * n.z);
        if (proj) {
          const ab = angleBetween(a, b);
          if (angleBetween(a, proj) <= ab && angleBetween(b, proj) <= ab) angle = Math.min(angle, Math.abs(Math.asin(Math.min(1, Math.max(-1, d)))));
        }
      }
      if (angle < bestAngle) {
        bestAngle = angle;
        best = r.constellation;
      }
    }
  }
  return best;
}
