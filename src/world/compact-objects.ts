/**
 * 星の燃えかす：白色矮星・中性子星（パルサー）・ブラックホール。
 * 実在のもの（public/data/compact.json。tools/build-compact.mjs）と、自動で作るもの（src/world/galaxy.ts の generateCell）がある。
 * 決まりと出典は docs/tech/compact-objects.md。three.js・DOM・astronomy-engine を読み込まない。
 */
import { hashInts, mulberry32 } from './random';
import type { BodyInfo } from './solar-system';
import { KM_PER_PC } from './units';
import { scale, type Vec3 } from './vec';

export type CompactKind = 'white-dwarf' | 'neutron-star' | 'black-hole';

export interface CompactObject {
  /** 恒星系の記号（W…・P…・B…） */
  code: string;
  name: string;
  kind: CompactKind;
  /** 太陽中心の EQJ（pc） */
  positionPc: Vec3;
  /** 星空に描く明るさ（絶対等級）。白色矮星は Gaia の値。中性子星・ブラックホールは見た目のための値 */
  absMag: number;
  bv: number;
  /** 白色矮星の温度（K） */
  teffK?: number;
  /** パルサーの自転の周期（秒） */
  periodS?: number;
}

/**
 * 中性子星・ブラックホールの星空での明るさ（見た目のための値）。
 * パルサーは光ではほとんど見えないが、探しに行けるよう、暗い青い星として描く（絶対等級 9）。
 * ブラックホール（X 線新星）は、相手の星と降着円盤の光として、暗い橙色の星で描く（絶対等級 6）
 */
const PULSAR_ABS_MAG = 9;
const BLACK_HOLE_ABS_MAG = 6;

type Row = [string, string, number, number, number, ...(number | null)[]];

export function decodeCompact(json: { whiteDwarfs: Row[]; pulsars: Row[]; blackHoles: Row[] }): CompactObject[] {
  const out: CompactObject[] = [];
  for (const r of json.whiteDwarfs) {
    out.push({
      code: r[0],
      name: r[1],
      kind: 'white-dwarf',
      positionPc: { x: r[2], y: r[3], z: r[4] },
      absMag: (r[5] as number) ?? 13,
      bv: 0,
      teffK: (r[6] as number | null) ?? undefined,
    });
  }
  for (const r of json.pulsars) {
    out.push({
      code: r[0],
      name: `パルサー ${r[1]}`,
      kind: 'neutron-star',
      positionPc: { x: r[2], y: r[3], z: r[4] },
      absMag: PULSAR_ABS_MAG,
      bv: -0.3,
      periodS: (r[5] as number | null) ?? undefined,
    });
  }
  for (const r of json.blackHoles) {
    out.push({
      code: r[0],
      name: `ブラックホール ${r[1]}`,
      kind: 'black-hole',
      positionPc: { x: r[2], y: r[3], z: r[4] },
      absMag: BLACK_HOLE_ABS_MAG,
      bv: 1.2,
    });
  }
  return out;
}

/** 白色矮星の半径（km）。太陽質量 0.6 くらいの典型的な値（地球ほど。約 8,700 km）。見た目のための近似 */
const WHITE_DWARF_RADIUS_KM = 8_700;
/** 中性子星の半径（km）。典型的な値 */
const NEUTRON_STAR_RADIUS_KM = 12;
/** ブラックホールの質量（太陽質量）。X 線新星のブラックホールの典型的な値（約 8）。自動で作るものは 5〜20 */
const BLACK_HOLE_MASS = 8;
/** シュワルツシルト半径（km）＝ 2GM/c² ≒ 2.95 km × 太陽質量 */
export const schwarzschildKm = (massSun: number): number => 2.953 * massSun;

/** 燃えかすの見た目（描画で使う） */
export interface CompactLook {
  kind: CompactKind;
  /** パルサーのビームの回る周期（秒）。本物の周期は速すぎる（ミリ秒）ので、見た目では 1 秒より速くしない */
  beamPeriodS?: number;
  /** ブラックホールのまわりに光る降着円盤があるか（X 線新星は有り、ひとりぼっちのブラックホールは無し） */
  disk?: boolean;
}

const codeSeed = (s: string) => hashInts(...Array.from(s, (c) => c.charCodeAt(0)));

/** 燃えかすの天体（1 つだけ。惑星は作らない） */
export function compactBody(
  code: string,
  name: string,
  kind: CompactKind,
  positionPc: Vec3,
  opts: { teffK?: number; periodS?: number; real: boolean },
): BodyInfo {
  const rand = mulberry32(codeSeed(code));
  const pole = { x: rand() * 2 - 1, y: rand() * 2 - 1, z: rand() * 2 - 1 };
  const positionKm = scale(positionPc, KM_PER_PC);
  const base = { id: `${code}.0`, parent: null, motion: { type: 'fixed' as const, positionKm } };
  if (kind === 'white-dwarf') {
    return {
      ...base,
      nameJa: opts.real ? `白色矮星 ${name}` : `白色矮星 ${code}`,
      radiusKm: WHITE_DWARF_RADIUS_KM,
      kind: 'star',
      spin: { type: 'steady', pole, periodHours: 2 + 20 * rand(), phaseRad: 0 },
      glow: [0.85, 0.9, 1],
      compact: { kind },
    };
  }
  if (kind === 'neutron-star') {
    const period = opts.periodS ?? 0.1 + rand();
    return {
      ...base,
      nameJa: opts.real ? name : `中性子星 ${code}`,
      radiusKm: NEUTRON_STAR_RADIUS_KM,
      kind: 'star',
      spin: { type: 'steady', pole, periodHours: period / 3600, phaseRad: 0 },
      glow: [0.7, 0.8, 1],
      compact: { kind, beamPeriodS: Math.max(1, period) },
    };
  }
  const mass = opts.real ? BLACK_HOLE_MASS : 5 + 15 * rand();
  return {
    ...base,
    nameJa: opts.real ? name : `ブラックホール ${code}`,
    radiusKm: schwarzschildKm(mass),
    kind: 'blackhole',
    spin: { type: 'steady', pole, periodHours: 1, phaseRad: 0 },
    compact: { kind, disk: opts.real },
  };
}
