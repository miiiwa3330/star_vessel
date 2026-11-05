/**
 * 天の川銀河の外の銀河（要件 F44）。データは public/data/galaxies.json（tools/build-galaxies.mjs。Updated Nearby Galaxy Catalog）。
 * 位置・距離・大きさ・傾き・種類・明るさは観測の値。形（星の並び）は種類に合わせて種から作る。決まりは docs/tech/galaxies.md。
 * three.js・DOM を読み込まない。
 */
import { hashInts, mulberry32 } from './random';
import { DEG } from './units';
import type { Vec3 } from './vec';
import type { HasExtent } from './nebulae';

export interface Galaxy extends HasExtent {
  name: string;
  nameJa: string | null;
  /** 長軸の見かけの大きさ（分角） */
  a26: number | null;
  axisRatio: number | null;
  inclinationDeg: number | null;
  /** 長軸の向き（北から東へ。度）。分からなければ null */
  positionAngleDeg: number | null;
  /** ハッブル分類の T（-3 楕円〜9 不規則）。分からなければ null */
  tType: number | null;
  /** B バンドの絶対等級 */
  absB: number;
}

type Row = [string, string | null, number, number, number, number | null, number | null, number | null, number | null, number | null, number];

/** 大きさの分からない銀河の直径は、明るさから決める（小さな矮小銀河の典型。観測の値ではない） */
const fallbackRadiusPc = (absB: number) => 300 * 10 ** (-0.2 * (absB + 10));

export const decodeGalaxies = (json: { galaxies: Row[] }): Galaxy[] =>
  json.galaxies.map((r) => {
    const positionPc = { x: r[2], y: r[3], z: r[4] };
    const dist = Math.hypot(r[2], r[3], r[4]);
    return {
      name: r[0],
      nameJa: r[1],
      positionPc,
      a26: r[5],
      axisRatio: r[6],
      inclinationDeg: r[7],
      positionAngleDeg: r[8],
      tType: r[9],
      absB: r[10],
      radiusPc: r[5] ? ((r[5] / 2 / 60) * DEG) * dist : fallbackRadiusPc(r[10]),
    };
  });

export const galaxyLabel = (g: Galaxy): string => g.nameJa ?? g.name;

const seedOf = (s: string) => hashInts(...Array.from(s, (c) => c.charCodeAt(0)));

/** その銀河を何個の光の点で描くか。見かけが大きい銀河ほど多い（太陽の近くから見て粗く見えないように）。合計は約 40 万個 */
export function galaxyPointCount(g: Galaxy, scale = 1): number {
  return Math.max(30, Math.min(60_000, Math.round(60 * (g.a26 ?? 1) ** 1.2 * scale)));
}

export interface GalaxyFrame {
  /** 円盤の面の 2 つの向き（major が見かけの長軸） */
  major: Vec3;
  minor: Vec3;
  /** 円盤の面に垂直な向き */
  normal: Vec3;
}

/**
 * 円盤の向き。観測の長軸の向き（無ければ種から決める）と傾き（無ければ見かけの軸の比から）に合わせる。
 * 太陽から見ると、見かけの長軸の向きと軸の比が観測と合う。傾きの表と裏のどちらかは、観測からは分からないので種から決める
 */
export function galaxyFrame(g: Galaxy): GalaxyFrame {
  const rand = mulberry32(seedOf(g.name));
  const p = g.positionPc;
  const d = Math.hypot(p.x, p.y, p.z);
  const los = { x: p.x / d, y: p.y / d, z: p.z / d };
  // 空の北と東（天の北極を、見ている向きに垂直に落とす）
  const nl = Math.hypot(-los.x * los.z, -los.y * los.z, 1 - los.z * los.z) || 1;
  const north = { x: (-los.x * los.z) / nl, y: (-los.y * los.z) / nl, z: (1 - los.z * los.z) / nl };
  const east = { x: north.y * los.z - north.z * los.y, y: north.z * los.x - north.x * los.z, z: north.x * los.y - north.y * los.x };
  const pa = (g.positionAngleDeg ?? rand() * 180) * DEG;
  const major = {
    x: north.x * Math.cos(pa) + east.x * Math.sin(pa),
    y: north.y * Math.cos(pa) + east.y * Math.sin(pa),
    z: north.z * Math.cos(pa) + east.z * Math.sin(pa),
  };
  const skyMinor = { x: los.y * major.z - los.z * major.y, y: los.z * major.x - los.x * major.z, z: los.x * major.y - los.y * major.x };
  const inc = (g.inclinationDeg ?? Math.acos(Math.min(1, g.axisRatio ?? 0.7)) / DEG) * DEG;
  const side = rand() < 0.5 ? -1 : 1;
  // 傾き 0（真上から見る）で normal が見ている向きと同じ
  const normal = {
    x: los.x * Math.cos(inc) + side * skyMinor.x * Math.sin(inc),
    y: los.y * Math.cos(inc) + side * skyMinor.y * Math.sin(inc),
    z: los.z * Math.cos(inc) + side * skyMinor.z * Math.sin(inc),
  };
  const minor = { x: normal.y * major.z - normal.z * major.y, y: normal.z * major.x - normal.x * major.z, z: normal.x * major.y - normal.y * major.x };
  return { major, minor, normal };
}

export interface GalaxyPoints {
  count: number;
  positions: Float32Array;
  /** 色（B−V） */
  colorIndex: Float32Array;
}

/**
 * 銀河の光の点を作る。形は種類（T）ごとの決まりで、本物の星の並びではない。
 * - 楕円・S0・球状の矮小銀河（T が 0 以下）：中心が濃い楕円体
 * - 渦巻（T が 1〜8）：指数関数の円盤（長さ＝半径 ÷ 3.2）＋中心のふくらみ（T が小さいほど大きい）＋ 2 本の対数らせんの腕
 * - 不規則（T が 9 以上か、分からないもの）：いくつかの塊
 */
export function galaxyPoints(g: Galaxy, count: number): GalaxyPoints {
  const rand = mulberry32(seedOf(g.name) ^ 0x47414c);
  const positions = new Float32Array(count * 3);
  const colorIndex = new Float32Array(count);
  const f = galaxyFrame(g);
  const R = g.radiusPc;
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-9))) * Math.cos(2 * Math.PI * rand());
  const t = g.tType ?? 10;
  const put = (i: number, a: number, b: number, c: number, bv: number) => {
    positions[i * 3] = g.positionPc.x + f.major.x * a + f.minor.x * b + f.normal.x * c;
    positions[i * 3 + 1] = g.positionPc.y + f.major.y * a + f.minor.y * b + f.normal.y * c;
    positions[i * 3 + 2] = g.positionPc.z + f.major.z * a + f.minor.z * b + f.normal.z * c;
    colorIndex[i] = bv;
  };
  if (t <= 0) {
    const q = Math.max(0.25, g.axisRatio ?? 0.7);
    for (let i = 0; i < count; i++) {
      const r = R * 0.45 * Math.pow(rand(), 2.2);
      const z = 2 * rand() - 1;
      const phi = 2 * Math.PI * rand();
      const s = Math.sqrt(1 - z * z);
      put(i, r * s * Math.cos(phi), r * s * Math.sin(phi) * q, r * z * q, 0.85 + 0.15 * rand());
    }
  } else if (t <= 8) {
    const bulge = Math.max(0.05, 0.42 - 0.05 * t);
    const scale = R / 3.2;
    const pitch = (10 + t * 2) * DEG;
    const arm0 = rand() * 2 * Math.PI;
    for (let i = 0; i < count; i++) {
      if (rand() < bulge) {
        const s = R * 0.09;
        put(i, gauss() * s, gauss() * s, gauss() * s * 0.7, 0.9);
        continue;
      }
      const r = -scale * Math.log(Math.max(1e-6, 1 - rand() * 0.97));
      const onArm = rand() < 0.55;
      let phi = 2 * Math.PI * rand();
      if (onArm) {
        const base = Math.log(Math.max(r, R * 0.02) / scale) / Math.tan(pitch);
        phi = arm0 + base + (rand() < 0.5 ? 0 : Math.PI) + gauss() * 0.22;
      }
      put(i, r * Math.cos(phi), r * Math.sin(phi), gauss() * R * 0.012, onArm ? 0.25 + 0.3 * rand() : 0.65);
    }
  } else {
    const q = Math.max(0.3, g.axisRatio ?? 0.6);
    const blobs = 3 + Math.floor(rand() * 4);
    const cx: [number, number][] = [];
    for (let k = 0; k < blobs; k++) cx.push([(rand() - 0.5) * R * 0.9, (rand() - 0.5) * R * 0.9 * q]);
    for (let i = 0; i < count; i++) {
      const c = cx[Math.floor(rand() * blobs)];
      const s = R * (rand() < 0.5 ? 0.12 : 0.28);
      put(i, c[0] + gauss() * s, c[1] + gauss() * s * q, gauss() * s * 0.4, 0.3 + 0.3 * rand());
    }
  }
  return { count, positions, colorIndex };
}
