/**
 * 天体の表面の模様を自動で描く（画像が無い天体のため）。
 *
 * 正距円筒図法（横が経度・縦が緯度）の RGBA の画像を作る。three.js の球にそのまま貼れる形。
 * 模様は球の上の 3 次元のノイズで描くので、経度 0 度と 360 度のつなぎ目が出ない。
 * 乱数は src/world/random.ts の整数の計算だけを使うので、同じ種なら誰の端末でも同じ模様になる
 * （系外惑星の自動生成：要件 F8 にも使う）。
 *
 * three.js・DOM を読み込まない（テストのため）。
 */

export type Rgb = readonly [number, number, number];

export type SurfaceLook =
  /** 縞のある星（ガスの惑星・氷の惑星）。colors を緯度の縞に並べ、turbulence で縞を乱す */
  | { kind: 'banded'; colors: readonly Rgb[]; bands: number; turbulence: number }
  /** 岩や氷の星。colors をノイズで混ぜ、craters の割合でくぼみを描く */
  | { kind: 'rocky'; colors: readonly Rgb[]; craters: number };

export interface SurfaceImage {
  width: number;
  height: number;
  /** RGBA、上の行（北極）から */
  data: Uint8Array;
}

/** hashInts の 1 回分の混ぜ方 */
function mix(h: number, v: number): number {
  h = Math.imul(h ^ (v | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return h ^ (h >>> 16);
}

/**
 * 格子の点の値（0〜1）。整数の計算だけで決める。
 * hashInts(seed, x, y, z) と同じ値（速くするため、可変長の引数を使わずに書き下した。テストで同じことを確かめている）
 */
export function lattice(seed: number, x: number, y: number, z: number): number {
  return (mix(mix(mix(mix(0x9e3779b9, seed), x), y), z) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 3 次元の値ノイズ（0〜1） */
export function valueNoise(seed: number, x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const fz = smooth(z - iz);
  const c = (dx: number, dy: number, dz: number) => lattice(seed, ix + dx, iy + dy, iz + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), fx), lerp(c(0, 1, 0), c(1, 1, 0), fx), fy),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), fx), lerp(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz,
  );
}

/** 細かさの違うノイズを重ねたもの（0〜1） */
export function fbm(seed: number, x: number, y: number, z: number, octaves = 5): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(seed + i * 1013, x * f, y * f, z * f);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** 色の並び colors の上を t（0〜1）でなめらかにたどる */
function palette(colors: readonly Rgb[], t: number): [number, number, number] {
  const n = colors.length;
  if (n === 1) return [...colors[0]];
  const x = Math.min(0.999999, Math.max(0, t)) * (n - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = colors[i];
  const b = colors[i + 1];
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
}

/** 表面の模様の画像を作る。width × height（ふつうは 2:1） */
export function paintSurface(look: SurfaceLook, seed: number, width = 512, height = 256): SurfaceImage {
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const lat = Math.PI / 2 - ((row + 0.5) / height) * Math.PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    for (let col = 0; col < width; col++) {
      const lon = ((col + 0.5) / width) * 2 * Math.PI;
      const px = cosLat * Math.cos(lon);
      const py = cosLat * Math.sin(lon);
      const pz = sinLat;
      let rgb: [number, number, number];
      if (look.kind === 'banded') {
        const warp = (fbm(seed, px * 3, py * 3, pz * 3) - 0.5) * look.turbulence;
        const fine = fbm(seed + 7, px * 12, py * 12, pz * 4, 3) - 0.5;
        // 緯度に沿った 1 次元のノイズで縞を作り、幅と濃さを不ぞろいにする
        const band = fbm(seed + 11, 0.37, 0.71, (sinLat + warp) * look.bands * 0.6 + fine * 0.25, 4);
        rgb = palette(look.colors, (band - 0.3) * 2.5);
      } else {
        const n = fbm(seed, px * 2.5, py * 2.5, pz * 2.5);
        rgb = palette(look.colors, (n - 0.25) * 2);
        if (look.craters > 0) {
          // くぼみ：細かいノイズの谷を暗くする
          const c = fbm(seed + 31, px * 9, py * 9, pz * 9, 3);
          const dark = Math.max(0, look.craters - c) / Math.max(look.craters, 1e-6);
          const k = 1 - 0.45 * dark;
          rgb = [rgb[0] * k, rgb[1] * k, rgb[2] * k];
        }
      }
      const o = (row * width + col) * 4;
      data[o] = Math.round(Math.min(255, Math.max(0, rgb[0])));
      data[o + 1] = Math.round(Math.min(255, Math.max(0, rgb[1])));
      data[o + 2] = Math.round(Math.min(255, Math.max(0, rgb[2])));
      data[o + 3] = 255;
    }
  }
  return { width, height, data };
}

/** 環のひとつの帯。内側と外側の半径（km）と、光をさえぎる割合（0〜1） */
export interface RingZone {
  innerKm: number;
  outerKm: number;
  opacity: number;
}

/**
 * 環の画像（横 1 列）。左が環の内側のふち、右が外側のふち。
 * 帯ごとの濃さに細かいノイズを重ねて、細い筋を描く。
 */
export function paintRing(zones: readonly RingZone[], color: Rgb, seed: number, width = 1024): SurfaceImage {
  const inner = Math.min(...zones.map((z) => z.innerKm));
  const outer = Math.max(...zones.map((z) => z.outerKm));
  const data = new Uint8Array(width * 4);
  for (let i = 0; i < width; i++) {
    const r = inner + ((i + 0.5) / width) * (outer - inner);
    const zone = zones.find((z) => r >= z.innerKm && r < z.outerKm);
    const streak = 0.7 + 0.6 * (fbm(seed, r / 900, 0, 0, 4) - 0.5);
    const a = zone ? Math.min(1, zone.opacity * streak) : 0;
    const shade = 0.85 + 0.3 * (fbm(seed + 3, r / 2500, 0, 0, 3) - 0.5);
    data[i * 4] = Math.round(Math.min(255, color[0] * shade));
    data[i * 4 + 1] = Math.round(Math.min(255, color[1] * shade));
    data[i * 4 + 2] = Math.round(Math.min(255, color[2] * shade));
    data[i * 4 + 3] = Math.round(a * 255);
  }
  return { width, height: 1, data };
}

/** 北極が上の画像を、three.js の球の向き（画像の 1 行目が v=0＝南極）に合わせて上下を入れ替える */
export function flipRows(img: SurfaceImage): SurfaceImage {
  const rowBytes = img.width * 4;
  const out = new Uint8Array(img.data.length);
  for (let r = 0; r < img.height; r++) {
    out.set(img.data.subarray(r * rowBytes, (r + 1) * rowBytes), (img.height - 1 - r) * rowBytes);
  }
  return { ...img, data: out };
}
