/**
 * 距離の単位。世界の計算はすべて km で持つ（恒星だけは pc でも扱う）。
 * 値の出典は docs/tech/world-model.md の「単位と座標系」。
 */

/** 1 天文単位（IAU 2012 で定義された値） */
export const KM_PER_AU = 149_597_870.7;

/** 1 パーセク（= 648000/π AU） */
export const KM_PER_PC = (648_000 / Math.PI) * KM_PER_AU;

/** 1 光年（ユリウス年 365.25 日 × 光速 299792.458 km/s） */
export const KM_PER_LY = 365.25 * 86_400 * 299_792.458;

export const DEG = Math.PI / 180;
