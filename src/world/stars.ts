/**
 * 恒星のデータの読み方と、見た目（大きさ・明るさ・色）の決め方。
 *
 * データは tools/build-stars.mjs が HYG v4.4 から作る public/data/stars.bin。
 * 形式は docs/tech/world-model.md の「恒星のデータ形式」。
 */

/** 1 個の星が持つ数の数。x・y・z（pc・EQJ）、絶対等級、色指数 B−V、HYG の id */
export const STAR_STRIDE = 6;

/** 色指数が分からない星に使う値（太陽と同じくらい） */
export const DEFAULT_BV = 0.65;

export interface StarCatalog {
  count: number;
  /** STAR_STRIDE 個ずつ並んだ数 */
  data: Float32Array;
}

export function decodeStars(buffer: ArrayBuffer): StarCatalog {
  const data = new Float32Array(buffer);
  if (data.length % STAR_STRIDE !== 0) throw new Error('stars.bin の長さが形式と合わない');
  return { count: data.length / STAR_STRIDE, data };
}

/** 星のデータの位置の元期（J2000.0。HYG の x・y・z）。UNIX ミリ秒 */
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const JULIAN_YEAR_MS = 365.25 * 86_400_000;

/** date が J2000.0 から何年か */
export const yearsSinceJ2000 = (date: Date): number => (date.getTime() - J2000_MS) / JULIAN_YEAR_MS;

/**
 * 星を今の位置へ動かす（要件 F5）。motion は星ごとに vx・vy・vz（pc/年。public/data/stars-motion.bin。星のデータと同じ順）。
 * 1 回の起動の間に星が動く量はとても小さいので、起動したときに 1 回だけ動かす。data を書き換える
 */
export function applyStarMotion(data: Float32Array, motion: Float32Array, years: number): void {
  const n = data.length / STAR_STRIDE;
  if (motion.length !== n * 3) throw new Error('stars-motion.bin の長さが星のデータと合わない');
  for (let i = 0; i < n; i++) {
    const o = i * STAR_STRIDE;
    data[o] += motion[i * 3] * years;
    data[o + 1] += motion[i * 3 + 1] * years;
    data[o + 2] += motion[i * 3 + 2] * years;
  }
}

/**
 * 星の見た目の決め方の数。starAppearance（テスト・CPU）と、星を描くシェーダー（src/render/star-sprites.ts）の両方が使う。
 *
 * 等級は 5 等で明るさ 100 倍の対数の尺度。本物どおりの差にすると暗い星がほぼ見えないので、
 * 差を少し縮めて（contrast 0.7）、1 等星より明るい星はすべて最大の明るさにする。
 * 肉眼の限界（6.5 等）より暗い星は、うっすら見える程度に残す（天の川の濃淡がわかるように）。
 * 2026-11-04：最初の値（指数 0.55・最小 0.04）では暗い星が一面に同じ明るさで散らばり、
 * 明るい星が目立たなかったので、いまの値にした。
 * 2026-11-05：fadeStartMag〜fadeEndMag で、とても暗い星を消すようにした。銀河の外から見たとき、
 * 本物の星（約 11 万個）が最小の明るさのまま太陽のまわりに重なり、明るい玉に見えたため。
 * 2026-11-05：見える限界（肉眼・双眼鏡・写真）を切り替えられるようにした（STAR_LIMITS。要件 F34）。限界の 1.5 等手前から消す
 */
export const STAR_LOOK = {
  refMag: 1,
  contrast: 0.7,
  minIntensity: 0.01,
  /** 見える限界（limitMag）の何等手前から消し始めるか */
  fadeWidthMag: 1.5,
  sizeBasePx: 6,
  sizeSlope: 0.12,
  sizeOffsetMag: 1.5,
  minSizePx: 1,
  maxSizePx: 8,
} as const;

/** 絶対等級と距離（pc）から見かけの等級。m = M + 5·log10(d / 10) */
export const apparentMagnitude = (absMag: number, distancePc: number): number =>
  absMag + 5 * Math.log10(Math.max(distancePc, 1e-7) / 10);

/**
 * 星の見え方（要件 F34）。見える限界の等級。肉眼・双眼鏡・写真（長時間露出）の 3 つから選べる。
 * 肉眼の限界 6.5 等はよく使われる値（暗い空で）、双眼鏡は口径 50 mm でおおよそ 9〜10 等、写真の 14 等はこれまでの値
 */
export const STAR_LIMITS = { naked: 6.5, binoculars: 9, photo: 14 } as const;
export type StarLimitMode = keyof typeof STAR_LIMITS;
export const DEFAULT_STAR_LIMIT: StarLimitMode = 'binoculars';
export const STAR_LIMIT_NAMES_JA: Record<StarLimitMode, string> = { naked: '肉眼', binoculars: '双眼鏡', photo: '写真' };

/** 見かけの等級から、画面での大きさ（CSS ピクセル）と明るさ（0〜1）。limitMag は見える限界の等級 */
export function starAppearance(mag: number, limitMag: number = STAR_LIMITS[DEFAULT_STAR_LIMIT]): { sizePx: number; intensity: number } {
  const L = STAR_LOOK;
  const fade = 1 - smoothstep(limitMag - L.fadeWidthMag, limitMag, mag);
  const intensity = clamp(10 ** (-0.4 * (mag - L.refMag) * L.contrast), L.minIntensity, 1) * fade;
  const sizePx = clamp(L.sizeBasePx * 10 ** (-L.sizeSlope * (mag + L.sizeOffsetMag)), L.minSizePx, L.maxSizePx);
  return { sizePx, intensity };
}

/**
 * 色指数 B−V から星の色（0〜1 の RGB）。
 * B−V → 表面温度は Ballesteros（2012）の式、温度 → 色は黒体の色の近似式。
 */
export function bvToRgb(bv: number): [number, number, number] {
  const b = clamp(Number.isFinite(bv) ? bv : DEFAULT_BV, -0.4, 2.0);
  const t = 4600 * (1 / (0.92 * b + 1.7) + 1 / (0.92 * b + 0.62));
  return kelvinToRgb(t);
}

/** 黒体の温度（K）から色。Tanner Helland の近似式を 0〜1 に直したもの */
export function kelvinToRgb(kelvin: number): [number, number, number] {
  const t = kelvin / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [clamp(r / 255, 0, 1), clamp(g / 255, 0, 1), clamp(b / 255, 0, 1)];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** GLSL・WGSL の smoothstep と同じ式（シェーダーと同じ結果にするため） */
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
