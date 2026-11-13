/**
 * 星座の絵と、図鑑の星座の図（2026-11-13）。
 *
 * - 絵：Stellarium の星座の絵（public/textures/constellations/。Free Art License 1.3）。絵 1 枚につき、絵の上の 3 つの点と、
 *   その点に合わせる星の方向が決まっている（public/data/constellation-art.json。tools/build-constellation-art.mjs）。
 *   3 つの点から、絵の上のどの点も空の方向に直せる（1 次の式で直してから、長さを 1 にする。Stellarium と同じ考え方）
 * - 図：図鑑に出す、地球（太陽）から見た星座の線と星。星座の真ん中に接する平面へ、まっすぐ落とす（北が上・東が左）
 *
 * 絵は太陽のそばから見た空に合わせて描かれたものなので、太陽から離れると星の並びとは合わなくなる。
 * three.js・DOM を読み込まない。決まりは docs/tech/constellations.md
 */
import type { Constellation } from './constellations';

export interface ConstellationArt {
  /** 画像のファイル名（public/textures/constellations/） */
  file: string;
  /** 画像の大きさ（px） */
  size: readonly [number, number];
  /** 合わせる 3 つの点：絵の上の位置（px。左上から）と、星の方向（単位ベクトル・EQJ） */
  anchors: readonly (readonly [number, number, number, number, number])[];
}

export const decodeConstellationArt = (json: { art: Record<string, ConstellationArt> }): Map<string, ConstellationArt> => new Map(Object.entries(json.art));

type V3 = [number, number, number];

/**
 * 絵の上の点（px）を、空の方向（長さを 1 にする前のベクトル）に直す関数。3 つの点を通る 1 次の式。
 * 3 つの点が 1 本の線の上に並んでいて決められないときは null
 */
export function artMapping(art: ConstellationArt): ((px: number, py: number) => V3) | null {
  const [a, b, c] = art.anchors;
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const det = ux * vy - uy * vx;
  if (Math.abs(det) < 1e-9) return null;
  return (px, py) => {
    const dx = px - a[0];
    const dy = py - a[1];
    // (dx, dy) = s·u + t·v
    const s = (dx * vy - dy * vx) / det;
    const t = (ux * dy - uy * dx) / det;
    return [0, 1, 2].map((k) => a[2 + k] + s * (b[2 + k] - a[2 + k]) + t * (c[2 + k] - a[2 + k])) as V3;
  };
}

export interface ArtGrid {
  /** 頂点の方向（単位ベクトル。3 個ずつ） */
  directions: Float32Array;
  /** 画像の上の位置（0〜1。左下が 0,0。2 個ずつ） */
  uvs: Float32Array;
  indices: Uint16Array;
}

/** 絵を空に貼るための網（n×n のマス）。頂点は空の方向なので、好きな半径を掛けて使う */
export function artGrid(art: ConstellationArt, n = 12): ArtGrid | null {
  const map = artMapping(art);
  if (!map) return null;
  const [w, h] = art.size;
  const directions = new Float32Array((n + 1) * (n + 1) * 3);
  const uvs = new Float32Array((n + 1) * (n + 1) * 2);
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const p = map((i / n) * w, (j / n) * h);
      const len = Math.hypot(p[0], p[1], p[2]) || 1;
      const o = j * (n + 1) + i;
      directions.set([p[0] / len, p[1] / len, p[2] / len], o * 3);
      uvs.set([i / n, 1 - j / n], o * 2);
    }
  }
  const indices = new Uint16Array(n * n * 6);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      const b = a + 1;
      const c = a + n + 1;
      indices.set([a, c, b, b, c, c + 1], (j * n + i) * 6);
    }
  }
  return { directions, uvs, indices };
}

/** 図鑑に出す星座の図（地球から見た形）。座標は、星座が半径 1 の円に収まるようにしたもの（x：右、y：上。北が上・東が左） */
export interface ConstellationFigure {
  id: string;
  nameJa: string;
  nameEn: string;
  /** 線（x1・y1・x2・y2 を 1 本ずつ） */
  lines: Float32Array;
  /** 星（線の端の星。x・y・見かけの等級） */
  stars: { x: number; y: number; mag: number }[];
  /** 方向（単位ベクトル）を図の座標にする */
  project: (x: number, y: number, z: number) => [number, number];
}

/** 図の中で、星座の線が収まる半径。重ねる絵は線より外へはみ出すので、その分を空ける */
const FIGURE_FILL = 0.7;

/**
 * 星座の図を作る。stars は stride 個ずつ並んだ星のデータ（x・y・z〈pc〉、絶対等級、…、最後が HYG の id）。
 * 同じ略号の星座（へび座の頭と尾）は 1 つにまとめる。線が 1 本も無い星座は入れない
 */
export function constellationFigures(list: readonly Constellation[], stars: Float32Array, stride: number): Map<string, ConstellationFigure> {
  const offsetOf = new Map<number, number>();
  for (let o = 0; o + stride <= stars.length; o += stride) offsetOf.set(stars[o + stride - 1], o);
  const merged = new Map<string, { c: Constellation; lines: (readonly [number, number])[] }>();
  for (const c of list) {
    const m = merged.get(c.id) ?? { c, lines: [] };
    m.lines.push(...c.lines);
    merged.set(c.id, m);
  }
  const out = new Map<string, ConstellationFigure>();
  for (const [id, { c, lines }] of merged) {
    // 線の端の星の、太陽から見た方向と見かけの等級
    const dirOf = new Map<number, { d: V3; mag: number }>();
    const pairs: [number, number][] = [];
    for (const [a, b] of lines) {
      const ok = [a, b].every((hyg) => {
        if (dirOf.has(hyg)) return true;
        const o = offsetOf.get(hyg);
        if (o === undefined) return false;
        const dist = Math.hypot(stars[o], stars[o + 1], stars[o + 2]);
        if (!(dist > 0)) return false;
        dirOf.set(hyg, { d: [stars[o] / dist, stars[o + 1] / dist, stars[o + 2] / dist], mag: stars[o + 3] + 5 * Math.log10(dist / 10) });
        return true;
      });
      if (ok) pairs.push([a, b]);
    }
    if (pairs.length === 0) continue;
    // 真ん中の方向と、そこでの東・北
    const sum: V3 = [0, 0, 0];
    for (const [a, b] of pairs) for (const h of [a, b]) for (let k = 0; k < 3; k++) sum[k] += dirOf.get(h)!.d[k];
    const sl = Math.hypot(sum[0], sum[1], sum[2]) || 1;
    const ctr: V3 = [sum[0] / sl, sum[1] / sl, sum[2] / sl];
    // 東 ＝ 天の北極 × 真ん中（天の極のすぐそばでは決まらないので、春分点の向きを使う）
    let east: V3 = [-ctr[1], ctr[0], 0];
    let el = Math.hypot(east[0], east[1]);
    if (el < 1e-6) {
      east = [0, 1, 0];
      el = 1;
    }
    east = [east[0] / el, east[1] / el, 0];
    const north: V3 = [ctr[1] * east[2] - ctr[2] * east[1], ctr[2] * east[0] - ctr[0] * east[2], ctr[0] * east[1] - ctr[1] * east[0]];
    // 空を内側から見るので、東は左
    const flat = (x: number, y: number, z: number): [number, number] => [-(x * east[0] + y * east[1] + z * east[2]), x * north[0] + y * north[1] + z * north[2]];
    let radius = 1e-9;
    for (const s of dirOf.values()) {
      const [x, y] = flat(...s.d);
      radius = Math.max(radius, Math.hypot(x, y));
    }
    const k = FIGURE_FILL / radius;
    const project = (x: number, y: number, z: number): [number, number] => {
      const p = flat(x, y, z);
      return [p[0] * k, p[1] * k];
    };
    const flatLines = new Float32Array(pairs.length * 4);
    pairs.forEach(([a, b], i) => flatLines.set([...project(...dirOf.get(a)!.d), ...project(...dirOf.get(b)!.d)], i * 4));
    out.set(id, {
      id,
      nameJa: c.nameJa.replace(/（.*）$/, ''),
      nameEn: c.nameEn.replace(/\s/g, ' '),
      lines: flatLines,
      stars: [...dirOf.values()].map((s) => {
        const [x, y] = project(...s.d);
        return { x, y, mag: s.mag };
      }),
      project,
    });
  }
  return out;
}

/**
 * 絵を図に重ねるための 1 次の変換（canvas の setTransform と同じ並び a・b・c・d・e・f：
 * 図の x = a·px + c·py + e、図の y = b·px + d·py + f）。3 つの合わせる点が、図の上の星の位置にちょうど重なる。
 * 大きな星座では、合わせる点から離れたところが少しずれる（空は球なので、平らな絵とは完全には合わない）
 */
export function artFigureTransform(art: ConstellationArt, figure: ConstellationFigure): [number, number, number, number, number, number] | null {
  const [p0, p1, p2] = art.anchors;
  const q = art.anchors.map((a) => figure.project(a[2], a[3], a[4]));
  const ux = p1[0] - p0[0];
  const uy = p1[1] - p0[1];
  const vx = p2[0] - p0[0];
  const vy = p2[1] - p0[1];
  const det = ux * vy - uy * vx;
  if (Math.abs(det) < 1e-9) return null;
  // [a c; b d]·[u v] = [q1−q0 q2−q0]
  const solve = (k: 0 | 1): [number, number] => {
    const r1 = q[1][k] - q[0][k];
    const r2 = q[2][k] - q[0][k];
    return [(r1 * vy - r2 * uy) / det, (r2 * ux - r1 * vx) / det];
  };
  const [a, c] = solve(0);
  const [b, d] = solve(1);
  return [a, b, c, d, q[0][0] - a * p0[0] - c * p0[1], q[0][1] - b * p0[0] - d * p0[1]];
}

/** 図鑑・訪れた記録の記号（例：CON:Ori） */
export const constellationKey = (id: string): string => `CON:${id}`;
