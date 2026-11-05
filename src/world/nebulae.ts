/**
 * 星雲（要件 F43）。データは public/data/nebulae.json（tools/build-nebulae.mjs。位置・距離・大きさは観測の値）。
 * 形は観測の画像ではなく、種類ごとの決まりで種から作る（誰が見ても同じ）。決まりは docs/tech/nebulae.md。
 * three.js・DOM を読み込まない。
 */
import { hashInts, mulberry32 } from './random';
import { fbm } from './surface';
import type { Vec3 } from './vec';

export type NebulaType = 'hii' | 'pn' | 'snr' | 'rn' | 'dn';
export const NEBULA_TYPE_NAMES_JA: Record<NebulaType, string> = {
  hii: '散光星雲（電離水素領域）',
  pn: '惑星状星雲',
  snr: '超新星残骸',
  rn: '反射星雲',
  dn: '暗黒星雲',
};

export interface Nebula {
  name: string;
  nameJa: string | null;
  type: NebulaType;
  positionPc: Vec3;
  radiusPc: number;
  /** 大きさが観測の値か（false：種類ごとの典型的な値） */
  measured: boolean;
}

type Row = [string, string | null, NebulaType, number, number, number, number, number];

export const decodeNebulae = (json: { nebulae: Row[] }): Nebula[] =>
  json.nebulae.map((r) => ({
    name: r[0],
    nameJa: r[1],
    type: r[2],
    positionPc: { x: r[3], y: r[4], z: r[5] },
    radiusPc: r[6],
    measured: r[7] === 1,
  }));

/** SIMBAD の名前の頭の NAME は、固有名の印なので出さない */
export const nebulaLabel = (n: Nebula): string => n.nameJa ?? n.name.replace(/^NAME /, '');

export interface HasExtent {
  positionPc: Vec3;
  radiusPc: number;
}

/** 大きく見えている順（半径 ÷ 距離）に max 個。minApparent（半径 ÷ 距離）より小さいものは入れない */
export function prominent<T extends HasExtent>(list: readonly T[], positionPc: Vec3, max: number, minApparent = 0): T[] {
  const best: { t: T; a: number }[] = [];
  for (const t of list) {
    const d = Math.hypot(t.positionPc.x - positionPc.x, t.positionPc.y - positionPc.y, t.positionPc.z - positionPc.z);
    const a = t.radiusPc / Math.max(d, 1e-6);
    if (a < minApparent) continue;
    if (best.length === max && a <= best[max - 1].a) continue;
    let i = best.length;
    while (i > 0 && best[i - 1].a < a) i--;
    best.splice(i, 0, { t, a });
    if (best.length > max) best.pop();
  }
  return best.map((b) => b.t);
}

/** 自分がその中（半径の内側）にいるなら、いちばん小さいもの */
export function insideOf<T extends HasExtent>(list: readonly T[], positionPc: Vec3): T | null {
  let best: T | null = null;
  for (const t of list) {
    const d = Math.hypot(t.positionPc.x - positionPc.x, t.positionPc.y - positionPc.y, t.positionPc.z - positionPc.z);
    if (d < t.radiusPc && (!best || t.radiusPc < best.radiusPc)) best = t;
  }
  return best;
}

export interface NebulaParticles {
  count: number;
  /** 太陽中心の EQJ（pc）。3 個ずつ */
  positions: Float32Array;
  /** 色（0〜1）。3 個ずつ */
  colors: Float32Array;
}

const seedOf = (s: string) => hashInts(...Array.from(s, (c) => c.charCodeAt(0)));

type Rgb = readonly [number, number, number];
const HA: Rgb = [1, 0.28, 0.32];
const OIII: Rgb = [0.3, 0.85, 0.8];
const BLUE: Rgb = [0.5, 0.65, 1];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * 星雲の形を点の集まりとして作る。実際の大きさ（半径）に合わせる。形は種類ごとの決まりで、本物の形を写したものではない。
 * - hii・rn：ノイズで濃淡を付けた、中心が濃い雲
 * - pn：薄い殻（赤道の方が濃い）。内側は青緑、外側は赤（酸素と水素の光の並び）
 * - snr：ノイズで糸のように切った薄い殻
 * - dn：濃い塊
 */
export function nebulaParticles(n: Nebula, count: number): NebulaParticles {
  const seed = seedOf(n.name);
  const rand = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const noiseSeed = seed & 0xffff;
  // 軸の傾き（惑星状星雲の赤道の向き）
  const axis = { x: rand() * 2 - 1, y: rand() * 2 - 1, z: rand() * 2 - 1 };
  const al = Math.hypot(axis.x, axis.y, axis.z) || 1;
  let made = 0;
  let tries = 0;
  while (made < count && tries < count * 40) {
    tries++;
    const z = 2 * rand() - 1;
    const a = 2 * Math.PI * rand();
    const s = Math.sqrt(1 - z * z);
    const dx = s * Math.cos(a);
    const dy = s * Math.sin(a);
    let r: number;
    let keep = 1;
    let color: Rgb;
    switch (n.type) {
      case 'pn': {
        const u = rand();
        r = 0.72 + 0.28 * u;
        const eq = (dx * axis.x + dy * axis.y + z * axis.z) / al;
        keep = 0.25 + 0.75 * (1 - eq * eq);
        color = mix(OIII, HA, u);
        break;
      }
      case 'snr': {
        r = 0.86 + 0.14 * rand();
        const f = fbm(noiseSeed, dx * 3.2 + 5, dy * 3.2 + 5, z * 3.2 + 5, 4);
        // ノイズの等高線の近くだけ残すと、糸のような形になる
        keep = Math.abs(f - 0.5) < 0.035 ? 1 : 0.02;
        color = mix(HA, OIII, rand() < 0.3 ? 0.8 : 0.1);
        break;
      }
      case 'rn': {
        r = rand() ** 0.8;
        keep = fbm(noiseSeed, dx * r * 2.5 + 3, dy * r * 2.5 + 3, z * r * 2.5 + 3, 4);
        color = BLUE;
        break;
      }
      case 'dn': {
        r = rand() ** 0.7;
        keep = fbm(noiseSeed, dx * r * 3 + 3, dy * r * 3 + 3, z * r * 3 + 3, 4) ** 2 * 2;
        color = [0, 0, 0];
        break;
      }
      default: {
        r = rand() ** 0.42;
        // 2 段のノイズで、大きな雲の塊と細かい筋を作る
        const f = fbm(noiseSeed, dx * r * 2.2 + 3, dy * r * 2.2 + 3, z * r * 2.2 + 3, 5);
        const v = fbm(noiseSeed + 9, dx * r * 7 + 1, dy * r * 7 + 1, z * r * 7 + 1, 3);
        keep = Math.max(0, f - 0.47) * 9 * Math.max(0, v - 0.32) * 4;
        // 真ん中は高温で青緑の光も混じる
        color = mix(OIII, HA, Math.min(1, 0.45 + r));
      }
    }
    if (rand() > keep) continue;
    const R = r * n.radiusPc;
    positions[made * 3] = n.positionPc.x + dx * R;
    positions[made * 3 + 1] = n.positionPc.y + dy * R;
    positions[made * 3 + 2] = n.positionPc.z + z * R;
    colors.set(color, made * 3);
    made++;
  }
  return { count: made, positions, colors };
}
