/**
 * 天の川銀河のモデル（要件 F8・F18）。本物の銀河の形（円盤・棒状の中心部・渦巻きの腕）に沿って、星を自動で生成する。
 *
 * 数の出典と、観測と合っているかの確かめ方は docs/tech/galaxy.md。
 * サーバー（住所の確かめ）とブラウザの両方で使う。three.js・DOM・astronomy-engine を読み込まない。
 *
 * 座標
 * - 太陽中心の EQJ（pc）：星の場面と同じ
 * - 銀河中心の座標（kpc）：x・y が銀河の円盤の面、z が銀河の北。太陽は (−R0, 0, Z0)、角度 θ = atan2(y, x) で太陽は θ = π
 */
import { hashInts, mulberry32 } from './random';
import { mulVec, transpose, type Mat3, type Vec3 } from './vec';

/** 太陽から銀河の中心までの距離（kpc）。GRAVITY Collaboration（2019） */
export const R0_KPC = 8.178;
/** 太陽の、銀河の円盤の面からの高さ（kpc）。Bennett & Bovy（2019） */
export const Z0_KPC = 0.0208;
/** 円盤の星の濃さが 1/e になる長さ（kpc）。Bland-Hawthorn & Gerhard（2016） */
export const DISK_SCALE_LENGTH_KPC = 2.6;
/** 円盤の厚さ（星の濃さが 1/e になる高さ、kpc）。同上（薄い円盤） */
export const DISK_SCALE_HEIGHT_KPC = 0.3;
/** 円盤の端（kpc）。これより外に星を置かない */
export const DISK_EDGE_KPC = 15;

/** 4 本の腕の巻き方（ピッチ角）。観測された腕の見える方向（接線の方向）に合わせて決めた（docs/tech/galaxy.md） */
export const ARM_PITCH_DEG = 13.0;
/** いて・りゅうこつ腕が、太陽の方向（θ = π）で銀河の中心からこの距離を通る（kpc）。同上 */
export const SGR_RADIUS_AT_SUN_KPC = 7.3;
/** 腕の太さ（中心からの広がり、kpc） */
export const ARM_WIDTH_KPC = 0.35;
/** 腕の上では、星がこの倍率だけ多い（1 + ARM_BOOST） */
export const ARM_BOOST = 2.5;
/** オリオン腕（太陽のある短い腕）。Reid ほか（2019）：太陽の方向で 8.26 kpc、ピッチ角 11.4 度 */
export const LOCAL_ARM = { radiusKpc: 8.26, pitchDeg: 11.4, halfSpanRad: 0.35 };
/** 棒状の中心部の向き：太陽と銀河中心を結ぶ線から 27 度。Wegg ほか（2015） */
export const BAR_ANGLE_DEG = 27;
/** 棒状の中心部の広がり（kpc。長い方・短い方・厚さ）。近似 */
export const BAR_SCALE_KPC = { x: 1.5, y: 0.6, z: 0.4 };
/** 中心部（バルジ）とする範囲（kpc） */
export const BULGE_RADIUS_KPC = 3;
/** 銀河の外（ハロー）とする範囲（kpc） */
export const HALO = { radiusKpc: 18, heightKpc: 3 };

/**
 * EQJ → 銀河の座標（太陽中心。+x が銀河の中心、+z が銀河の北極）の回転行列（行優先）。
 * astronomy-engine の Rotation_EQJ_GAL と同じ値（テストで照らし合わせている）
 */
export const EQJ_TO_GAL: Mat3 = [
  -0.0548624779711344, -0.8734572784246782, -0.483800052994852, 0.4941095946388765, -0.4447938112296831,
  0.7470034631630423, -0.8676668813529025, -0.1980677870294097, 0.4559861124470794,
];
const GAL_TO_EQJ = transpose(EQJ_TO_GAL);

/** 太陽中心の EQJ（pc）→ 銀河中心の座標（kpc） */
export function eqjPcToGalacto(p: Vec3): Vec3 {
  const g = mulVec(EQJ_TO_GAL, p);
  return { x: g.x / 1000 - R0_KPC, y: g.y / 1000, z: g.z / 1000 + Z0_KPC };
}

/** 銀河中心の座標（kpc）→ 太陽中心の EQJ（pc） */
export function galactoToEqjPc(g: Vec3): Vec3 {
  return mulVec(GAL_TO_EQJ, { x: (g.x + R0_KPC) * 1000, y: g.y * 1000, z: (g.z - Z0_KPC) * 1000 });
}

// ── 腕 ──────────────────────────────────────────────

export type ArmCode = 'SGR' | 'PER' | 'NOR' | 'SCU' | 'ORI' | 'BLG' | 'HAL';

export const ARM_NAMES_JA: Record<ArmCode, string> = {
  SGR: 'いて・りゅうこつ腕',
  PER: 'ペルセウス腕',
  NOR: 'じょうぎ・外縁腕',
  SCU: 'たて・ケンタウルス腕',
  ORI: 'オリオン腕',
  BLG: '中心部',
  HAL: 'ハロー',
};
export const ARM_CODES = Object.keys(ARM_NAMES_JA) as ArmCode[];

/** 4 本の腕を、太陽の方向で内から外へ数えた順。番号 k（mod 4）で腕が決まる。0 がいて・りゅうこつ腕 */
const MAJOR_ARMS: ArmCode[] = ['SGR', 'PER', 'NOR', 'SCU'];
const B = Math.tan((ARM_PITCH_DEG * Math.PI) / 180);
const ARM_SPACING = (Math.PI / 2) * B; // 隣の腕との ln R の差

/** (R, θ) から見た、いちばん近い 4 本の腕の番号と、その腕までの半径の差（kpc） */
function nearestMajorArm(r: number, theta: number): { arm: ArmCode; dR: number } {
  // θ を太陽の方向（π）のまわり ±π に収める
  const t = theta - 2 * Math.PI * Math.round((theta - Math.PI) / (2 * Math.PI));
  const u = (Math.log(r) - Math.log(SGR_RADIUS_AT_SUN_KPC) - B * (t - Math.PI)) / ARM_SPACING;
  const k = Math.round(u);
  const rArm = r * Math.exp(-(u - k) * ARM_SPACING);
  return { arm: MAJOR_ARMS[((k % 4) + 4) % 4], dR: r - rArm };
}

/** オリオン腕までの半径の差（kpc）。範囲の外なら Infinity */
function localArmDistance(r: number, theta: number): number {
  const t = theta - 2 * Math.PI * Math.round((theta - Math.PI) / (2 * Math.PI));
  if (Math.abs(t - Math.PI) > LOCAL_ARM.halfSpanRad) return Number.POSITIVE_INFINITY;
  const rLocal = LOCAL_ARM.radiusKpc * Math.exp(Math.tan((LOCAL_ARM.pitchDeg * Math.PI) / 180) * (t - Math.PI));
  return r - rLocal;
}

/** 銀河中心の座標（kpc）の場所が、どの腕（区域）か。宇宙の住所の 2 つ目の階層 */
export function armAt(g: Vec3): ArmCode {
  const r = Math.hypot(g.x, g.y);
  if (r > HALO.radiusKpc || Math.abs(g.z) > HALO.heightKpc) return 'HAL';
  if (r < BULGE_RADIUS_KPC) return 'BLG';
  const theta = Math.atan2(g.y, g.x);
  const major = nearestMajorArm(r, theta);
  const local = localArmDistance(r, theta);
  return Math.abs(local) < Math.abs(major.dR) ? 'ORI' : major.arm;
}

// ── 星の濃さ ──────────────────────────────────────────

const armFactor = (r: number, theta: number) => {
  const { dR } = nearestMajorArm(r, theta);
  const local = localArmDistance(r, theta);
  const near = (d: number) => (Number.isFinite(d) ? Math.exp(-(d * d) / (2 * ARM_WIDTH_KPC * ARM_WIDTH_KPC)) : 0);
  return 1 + ARM_BOOST * Math.max(near(dR), 0.6 * near(local));
};

const BAR_COS = Math.cos(Math.PI - (BAR_ANGLE_DEG * Math.PI) / 180);
const BAR_SIN = Math.sin(Math.PI - (BAR_ANGLE_DEG * Math.PI) / 180);

/** 棒状の中心部の濃さ（中心で 1） */
function barDensity(g: Vec3): number {
  const bx = g.x * BAR_COS + g.y * BAR_SIN;
  const by = -g.x * BAR_SIN + g.y * BAR_COS;
  return Math.exp(-0.5 * ((bx / BAR_SCALE_KPC.x) ** 2 + (by / BAR_SCALE_KPC.y) ** 2 + (g.z / BAR_SCALE_KPC.z) ** 2));
}

/** 中心部の濃さを、円盤と比べてどれだけにするか（見た目に合わせた値） */
const BAR_WEIGHT = 4;

/** 星の濃さ（太陽のまわりで 1 になるように割った値） */
export function relativeDensity(g: Vec3): number {
  const r = Math.hypot(g.x, g.y);
  const disk =
    r > DISK_EDGE_KPC
      ? 0
      : Math.exp(-r / DISK_SCALE_LENGTH_KPC) * Math.exp(-Math.abs(g.z) / DISK_SCALE_HEIGHT_KPC) * armFactor(r, Math.atan2(g.y, g.x));
  return (disk + BAR_WEIGHT * barDensity(g)) / SUN_DENSITY;
}
const SUN_DENSITY = (() => {
  const g = { x: -R0_KPC, y: 0, z: Z0_KPC };
  const r = R0_KPC;
  return Math.exp(-r / DISK_SCALE_LENGTH_KPC) * Math.exp(-Z0_KPC / DISK_SCALE_HEIGHT_KPC) * armFactor(r, Math.PI) + BAR_WEIGHT * barDensity(g);
})();

// ── 銀河の光（遠くから見た銀河の形） ──────────────────────

export interface GlowPoints {
  count: number;
  /** 太陽中心の EQJ（pc）。3 個ずつ */
  positions: Float32Array;
  /** 色（B−V） */
  colorIndex: Float32Array;
  /** 見た目の大きさ（pc） */
  sizePc: Float32Array;
  /** 銀河の円盤の面からの高さ（kpc）。ちりで暗くなる量の計算に使う */
  galactoZ: Float32Array;
  /** 明るさの重み。腕の上（若い明るい星が多い）は明るく、腕の間と中心部は控えめ（見た目に合わせた値） */
  brightness: Float32Array;
}

/** 光の点の明るさの重み（腕の上・腕の間・中心部） */
export const GLOW_BRIGHTNESS = { arm: 1.8, interArm: 0.5, bulge: 0.7 };

/**
 * ちりの濃さが 1/e になる高さ（kpc）。ちりは円盤の面で最も濃く、離れるほど e^(−|z|/h) で薄くなる（約 100 pc、近似）。
 * 2026-11-05：最初は「この高さまで一様にあり、その先は無い」板にしていたが、境目にカメラがあると、くっきりした線が見えたのでやめた
 */
export const DUST_SCALE_HEIGHT_KPC = 0.1;
/**
 * 円盤の面（いちばん濃いところ）を、この距離（kpc）進むと光が 1/e になる。本物（1 kpc あたり約 1.8 等暗くなる、1/e で約 0.6 kpc）より
 * 弱めにしている（見た目に合わせた値）
 */
export const DUST_EXTINCTION_LENGTH_KPC = 1.5;

/**
 * 高さ z1 から z2 へまっすぐ進むとき、1 kpc 進むあたりに通るちりの量の平均（円盤の面で 1）。
 * ちりの濃さ e^(−|z|/h) を z で積分した F(z) = sign(z)·h·(1 − e^(−|z|/h)) の差を、高さの差で割る。
 * 高さの差がとても小さいときは、その高さの濃さそのもの。シェーダー（src/render/galaxy-view.ts）と同じ式
 */
export function meanDustDensity(z1: number, z2: number): number {
  const h = DUST_SCALE_HEIGHT_KPC;
  const F = (z: number) => Math.sign(z) * h * (1 - Math.exp(-Math.abs(z) / h));
  const eps = 1e-4;
  return (Math.abs(F(z2) - F(z1)) + eps * Math.exp(-Math.abs(z1) / h)) / (Math.abs(z2 - z1) + eps);
}

/** 銀河の光の点の種。全員で同じ形にするため固定 */
export const GALAXY_SEED = 20261105;
/** 中心部の点の割合 */
const BULGE_FRACTION = 0.2;

/**
 * 銀河の形に沿って、光の点を count 個置く。1 つの点は、たくさんの星をまとめた光。
 * 円盤は R の確率 ∝ R·e^(−R/Rd)（2 つの指数分布の和）で置き、腕の上ほど残す。中心部は棒の形の正規分布。
 */
export function sampleGlow(count: number, seed = GALAXY_SEED): GlowPoints {
  const rand = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const colorIndex = new Float32Array(count);
  const sizePc = new Float32Array(count);
  const galactoZ = new Float32Array(count);
  const brightness = new Float32Array(count);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  let i = 0;
  while (i < count) {
    let g: Vec3;
    let bv: number;
    let size: number;
    let weight: number;
    if (rand() < BULGE_FRACTION) {
      const bx = gauss() * BAR_SCALE_KPC.x;
      const by = gauss() * BAR_SCALE_KPC.y;
      g = { x: bx * BAR_COS - by * BAR_SIN, y: bx * BAR_SIN + by * BAR_COS, z: gauss() * BAR_SCALE_KPC.z };
      bv = 1.0 + 0.2 * rand();
      size = 120;
      weight = GLOW_BRIGHTNESS.bulge;
    } else {
      const r = -DISK_SCALE_LENGTH_KPC * Math.log((1 - rand()) * (1 - rand()));
      if (r > DISK_EDGE_KPC) continue;
      const theta = 2 * Math.PI * rand();
      const f = armFactor(r, theta);
      if (rand() * (1 + ARM_BOOST) > f) continue;
      const z = DISK_SCALE_HEIGHT_KPC * Math.log(1 - rand()) * (rand() < 0.5 ? 1 : -1);
      g = { x: r * Math.cos(theta), y: r * Math.sin(theta), z };
      // 腕の上は若い青い星が多い
      bv = f > 2 ? 0.0 + 0.3 * rand() : 0.5 + 0.4 * rand();
      size = 60;
      weight = f > 2 ? GLOW_BRIGHTNESS.arm : GLOW_BRIGHTNESS.interArm;
    }
    const p = galactoToEqjPc(g);
    positions.set([p.x, p.y, p.z], i * 3);
    colorIndex[i] = bv;
    sizePc[i] = size;
    galactoZ[i] = g.z;
    brightness[i] = weight;
    i++;
  }
  return { count, positions, colorIndex, sizePc, galactoZ, brightness };
}

// ── 1 つずつの星（近くに来たときに作る） ─────────────────

/** 星を作るマス目の大きさ（pc）。銀河中心の座標で切る */
export const CELL_PC = 25;
/** 太陽のまわりで、1 pc³ あたりに作る星の数（見た目に合わせた値。本物は暗い星を含めて約 0.1） */
export const GENERATED_DENSITY_PER_PC3 = 0.004;
/** 1 つのマス目に作る星の上限 */
export const MAX_STARS_PER_CELL = 400;
/** 本物のデータ（HYG）がある範囲（太陽からの pc）。この中では星を作らない */
export const REAL_DATA_RADIUS_PC = 1000;

export interface Cell {
  ix: number;
  iy: number;
  iz: number;
}

/** 太陽中心の EQJ（pc）の場所が、どのマス目か */
export function cellOf(pEqjPc: Vec3): Cell {
  const g = eqjPcToGalacto(pEqjPc);
  return {
    ix: Math.floor((g.x * 1000) / CELL_PC),
    iy: Math.floor((g.y * 1000) / CELL_PC),
    iz: Math.floor((g.z * 1000) / CELL_PC),
  };
}

/** マス目の中心（銀河中心の座標・kpc） */
export const cellCenterGalacto = (c: Cell): Vec3 => ({
  x: ((c.ix + 0.5) * CELL_PC) / 1000,
  y: ((c.iy + 0.5) * CELL_PC) / 1000,
  z: ((c.iz + 0.5) * CELL_PC) / 1000,
});

const CELL_OFFSET = 36 ** 3 / 2; // マス目の番号を 0 以上にするための足し算（±約 583 kpc まで）
const b36 = (n: number, width: number) => n.toString(36).toUpperCase().padStart(width, '0');

/** 作った星の恒星系の記号：G ＋ マス目（36 進 3 桁 × 3）＋ マス目の中の番号（36 進 2 桁） */
export const generatedSystemCode = (c: Cell, index: number): string =>
  `G${b36(c.ix + CELL_OFFSET, 3)}${b36(c.iy + CELL_OFFSET, 3)}${b36(c.iz + CELL_OFFSET, 3)}${b36(index, 2)}`;

/** 作った星の恒星系の記号から、マス目を取り出す（サーバーが腕を確かめるのに使う） */
export function parseGeneratedSystem(code: string): { cell: Cell; index: number } | null {
  const m = /^G([0-9A-Z]{3})([0-9A-Z]{3})([0-9A-Z]{3})([0-9A-Z]{2})$/.exec(code);
  if (!m) return null;
  const n = (s: string) => Number.parseInt(s, 36);
  return { cell: { ix: n(m[1]) - CELL_OFFSET, iy: n(m[2]) - CELL_OFFSET, iz: n(m[3]) - CELL_OFFSET }, index: n(m[4]) };
}

export interface GeneratedStar {
  /** 太陽中心の EQJ（pc） */
  position: Vec3;
  absMag: number;
  bv: number;
  system: string;
  /** 白色矮星・中性子星・ブラックホール（ふつうの星は無し） */
  compact?: 'white-dwarf' | 'neutron-star' | 'black-hole';
}

/**
 * 自動で作る、星の燃えかす（白色矮星・中性子星・ブラックホール）の、ふつうの星に対する割合（docs/tech/compact-objects.md）。
 * 白色矮星：太陽のまわりの数密度 約 4.5×10⁻³ pc⁻³（Hollands ほか 2018）÷ 星全体 約 0.1 pc⁻³ ≒ 5%。
 * 中性子星：銀河に約 10⁹ 個（Sartore ほか 2010）÷ 星 約 10¹¹ 個 ≒ 1%。ブラックホール：約 10⁸ 個（Olejak ほか 2020）≒ 0.1%
 */
export const COMPACT_FRACTIONS = { 'white-dwarf': 0.05, 'neutron-star': 0.01, 'black-hole': 0.001 } as const;
/** 燃えかすの番号は 1000 から（ふつうの星の番号と重ならないように。マス目の星は 400 個まで） */
export const COMPACT_INDEX_BASE = 1000;

/**
 * 1 つのマス目の星を作る。同じマス目なら、誰の端末でもいつも同じ星になる。
 * 本物のデータの範囲の中では作らない。
 */
export function generateCell(c: Cell): GeneratedStar[] {
  const center = cellCenterGalacto(c);
  if (Math.hypot(...Object.values(galactoToEqjPc(center))) < REAL_DATA_RADIUS_PC) return [];
  const rand = mulberry32(hashInts(c.ix, c.iy, c.iz, GALAXY_SEED));
  const expected = GENERATED_DENSITY_PER_PC3 * relativeDensity(center) * CELL_PC ** 3;
  // 数は、期待値のまわりで ±50% ばらつかせる（ポアソン分布の代わり。対数を使わず、端末による差を避ける）
  const count = Math.min(MAX_STARS_PER_CELL, Math.floor(expected * (0.5 + rand())));
  const stars: GeneratedStar[] = [];
  for (let i = 0; i < count; i++) {
    const g = {
      x: ((c.ix + rand()) * CELL_PC) / 1000,
      y: ((c.iy + rand()) * CELL_PC) / 1000,
      z: ((c.iz + rand()) * CELL_PC) / 1000,
    };
    const { absMag, bv } = sampleStarType(rand);
    stars.push({ position: galactoToEqjPc(g), absMag, bv, system: generatedSystemCode(c, i) });
  }
  // 星の燃えかす。ふつうの星とは別の乱数の流れで作り、番号を 1000 から振る（ふつうの星の並びと記号を変えないため）
  const rc = mulberry32(hashInts(c.ix, c.iy, c.iz, GALAXY_SEED, 0x434f4d50));
  let k = 0;
  for (let i = 0; i < count; i++) {
    const u = rc();
    const compact =
      u < COMPACT_FRACTIONS['black-hole']
        ? 'black-hole'
        : u < COMPACT_FRACTIONS['black-hole'] + COMPACT_FRACTIONS['neutron-star']
          ? 'neutron-star'
          : u < COMPACT_FRACTIONS['black-hole'] + COMPACT_FRACTIONS['neutron-star'] + COMPACT_FRACTIONS['white-dwarf']
            ? 'white-dwarf'
            : null;
    const g = { x: ((c.ix + rc()) * CELL_PC) / 1000, y: ((c.iy + rc()) * CELL_PC) / 1000, z: ((c.iz + rc()) * CELL_PC) / 1000 };
    if (!compact) continue;
    // 見かけの明るさ：白色矮星は絶対等級 11〜15 等。中性子星・ブラックホールは光では見えないので、描かない明るさにする
    const absMag = compact === 'white-dwarf' ? 11 + 4 * rc() : 40;
    stars.push({ position: galactoToEqjPc(g), absMag, bv: compact === 'white-dwarf' ? 0 : 0.65, system: generatedSystemCode(c, COMPACT_INDEX_BASE + k), compact });
    k++;
  }
  return stars;
}

/**
 * 星の明るさ（絶対等級）と色（B−V）。暗い星ほど多い（P(M) ∝ 10^(0.15M)、−3〜13 等）。
 * 色は主系列の近似（M = −3 で −0.2、M = 5 で太陽と同じ 0.65）。5% は赤色巨星（M ≈ 0、B−V ≈ 1.2）。近似
 */
export function sampleStarType(rand: () => number): { absMag: number; bv: number } {
  if (rand() < 0.05) return { absMag: -0.5 + rand(), bv: 1.1 + 0.3 * rand() };
  const lo = 10 ** (0.15 * -3);
  const hi = 10 ** (0.15 * 13);
  const absMag = Math.log10(lo + (hi - lo) * rand()) / 0.15;
  return { absMag, bv: Math.min(2, -0.2 + (absMag + 3) * 0.106) };
}
