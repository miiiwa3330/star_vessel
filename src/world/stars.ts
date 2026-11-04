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
 */
export const STAR_LOOK = {
  refMag: 1,
  contrast: 0.7,
  minIntensity: 0.01,
  fadeStartMag: 10,
  fadeEndMag: 14,
  sizeBasePx: 6,
  sizeSlope: 0.12,
  sizeOffsetMag: 1.5,
  minSizePx: 1,
  maxSizePx: 8,
} as const;

/** 絶対等級と距離（pc）から見かけの等級。m = M + 5·log10(d / 10) */
export const apparentMagnitude = (absMag: number, distancePc: number): number =>
  absMag + 5 * Math.log10(Math.max(distancePc, 1e-7) / 10);

/** 見かけの等級から、画面での大きさ（CSS ピクセル）と明るさ（0〜1） */
export function starAppearance(mag: number): { sizePx: number; intensity: number } {
  const L = STAR_LOOK;
  const fade = 1 - smoothstep(L.fadeStartMag, L.fadeEndMag, mag);
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
