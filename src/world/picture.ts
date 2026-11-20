/**
 * 図鑑の絵を、天体 1 つずつのデータから決める計算（要件 F38。2026-11-13 にオーナーが決めた）。
 * 「種類ごとに同じ絵」をやめ、手元にあるデータ（恒星の半径と温度、星団の数・広がり・年齢、銀河の型・傾き・明るさ、
 * 星雲の大きさ、彗星の明るさと核の大きさ）で、大きさ・形・色を変える。
 *
 * ここで決めるのは絵の上の割合（0〜1 など）だけで、どれも見た目のための近似。データが無い項目は、種類の典型の値にする。
 * three.js・DOM を読み込まない。決まりと出典は docs/product/info-and-collection.md・docs/tech/collection.md
 */

import { T_SUN_K } from './star-color';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const DEG = Math.PI / 180;


// ── 恒星 ────────────────────────────────────────────

export interface StarTraits {
  /** 半径（太陽半径） */
  radiusSun: number;
  /** 有効温度（K） */
  teffK: number;
}

/**
 * 表面の模様の種類（見た目のための模様。太陽のほかの恒星の表面は、ほとんど観測できていない）。
 * - smooth：高温の星。外側に対流の層が無いので、粒の模様がほとんど無い
 * - granules：太陽に近い星。細かな粒（粒状斑）と小さな黒点
 * - spots：赤色矮星。大きな黒点（活動が強く、黒点が表面の広い割合を覆うものがある）
 * - cells：赤色巨星・超巨星。数個の巨大な対流の模様（ベテルギウスの観測に見られる）
 */
export type StarSurface = 'smooth' | 'granules' | 'spots' | 'cells';

export interface StarPicture {
  /** 絵の中の球の大きさ（0.3〜1）。半径の対数（太陽 0.5、10 倍ごとに +0.17） */
  size: number;
  /** 光の広がりの強さ（0.2〜1）。光度の対数（太陽 0.5、10 倍ごとに +0.12） */
  glow: number;
  surface: StarSurface;
}

/** 光度（太陽光度）。L = R²·(T/T☉)⁴ */
export const starLuminosity = (t: StarTraits): number => t.radiusSun ** 2 * (t.teffK / T_SUN_K) ** 4;

export function starPicture(t: StarTraits): StarPicture {
  const r = Math.max(1e-6, t.radiusSun);
  const size = clamp(0.5 + 0.17 * Math.log10(r), 0.3, 1);
  const glow = clamp(0.5 + 0.12 * Math.log10(Math.max(1e-12, starLuminosity(t))), 0.2, 1);
  const surface: StarSurface = r >= 8 && t.teffK < 5500 ? 'cells' : t.teffK >= 7500 ? 'smooth' : t.teffK < 4000 ? 'spots' : 'granules';
  return { size, glow, surface };
}

/** データが無い恒星（太陽と同じとする） */
export const DEFAULT_STAR_PICTURE: StarPicture = starPicture({ radiusSun: 1, teffK: T_SUN_K });
/** 中性子星・白色矮星でデータが無いもの：小さく、なめらか */
export const COMPACT_STAR_PICTURE: StarPicture = { size: 0.3, glow: 0.4, surface: 'smooth' };

// ── 星団 ────────────────────────────────────────────

export interface ClusterTraits {
  kind: 'open' | 'globular';
  members: number;
  r50Pc: number;
  rtPc: number | null;
  logAge: number | null;
}

export interface ClusterPicture {
  /** 描く星の数（メンバーの数から。散開は 20〜420、球状は 300〜1,600） */
  count: number;
  /** 中心への集まり方：プラマーの分布の長さ a を、絵の半径（＝潮汐半径）で割ったもの（0.06〜0.45。小さいほど中心に集まる） */
  core: number;
  /** 星の色の寄り（0：青白い＝若い、1：黄〜赤＝古い）。年齢 1,000 万年で 0、100 億年で 1 */
  warm: number;
}

export function clusterPicture(c: ClusterTraits): ClusterPicture {
  const members = Math.max(1, c.members);
  const count = c.kind === 'globular' ? clamp(Math.round(18 * Math.sqrt(members)), 300, 1600) : clamp(Math.round(members * 0.8), 20, 420);
  // 宇宙の中の星団（src/world/clusters.ts の clusterStars）と同じ：半数半径 r50 ≈ 1.305 a、外の端は潮汐半径（無ければ r50 の 5 倍）
  const rt = c.rtPc ?? c.r50Pc * 5;
  const core = clamp(c.r50Pc / 1.305 / Math.max(rt, 1e-9), 0.06, 0.45);
  const warm = c.logAge === null ? (c.kind === 'globular' ? 0.8 : 0.35) : clamp((c.logAge - 7) / 3, 0, 1);
  return { count, core, warm };
}

export const DEFAULT_CLUSTER_PICTURE = (globular: boolean): ClusterPicture =>
  clusterPicture({ kind: globular ? 'globular' : 'open', members: globular ? 2500 : 200, r50Pc: 1, rtPc: null, logAge: null });

// ── 銀河 ────────────────────────────────────────────

export interface GalaxyTraits {
  tType: number | null;
  axisRatio: number | null;
  inclinationDeg: number | null;
  positionAngleDeg: number | null;
  absB: number;
}

export interface GalaxyPicture {
  /** 形。宇宙の中（src/world/galaxies.ts）と同じ分け方：T が 0 以下は楕円、1〜8 は渦巻、9 以上・分からないものは不規則 */
  shape: 'elliptical' | 'spiral' | 'irregular';
  /** 渦巻の、中心のふくらみの大きさ（T が小さいほど大きい。0.1〜0.34） */
  bulge: number;
  /** 渦巻の腕の巻きの強さ（T が小さいほどきつい。1.6〜3.2） */
  wind: number;
  /** 楕円銀河のつぶれ方（見かけの軸の比。0.3〜1） */
  flatten: number;
  /** 絵の中の大きさ（0.5〜1）と、点の数の割合（0.25〜1）。明るさ（B の絶対等級 −10 〜 −21）から */
  scale: number;
  density: number;
  /** 最初に見る向き（ラジアン）。観測の傾き（真横から見る銀河は 0 に近く、真上から見る銀河は大きい） */
  pitch: number;
  /** 一覧の絵の回す角度（度。時計回りが正）。観測の長軸の向き（北が上・東が左）。分からなければ null */
  rollDeg: number | null;
}

export function galaxyPicture(g: GalaxyTraits): GalaxyPicture {
  const t = g.tType;
  const shape = t === null || t >= 9 ? 'irregular' : t <= 0 ? 'elliptical' : 'spiral';
  const tt = clamp(t ?? 5, 1, 8);
  const lum = clamp((-g.absB - 10) / 11, 0, 1);
  const incl = g.inclinationDeg ?? (g.axisRatio !== null ? Math.acos(clamp(g.axisRatio, 0, 1)) / DEG : null);
  return {
    shape,
    bulge: 0.374 - 0.034 * tt,
    wind: 3.43 - 0.23 * tt,
    flatten: clamp(g.axisRatio ?? 0.7, 0.3, 1),
    scale: 0.5 + 0.5 * lum,
    density: 0.25 + 0.75 * lum,
    pitch: shape === 'elliptical' || incl === null ? 0.5 : clamp((90 - incl) * DEG, 0.05, 1.45),
    rollDeg: g.positionAngleDeg === null ? null : 90 - g.positionAngleDeg,
  };
}

export const DEFAULT_GALAXY_PICTURE: GalaxyPicture = galaxyPicture({ tType: 4, axisRatio: null, inclinationDeg: null, positionAngleDeg: null, absB: -19 });

// ── 星雲 ────────────────────────────────────────────

/** 絵の中の大きさ（0.4〜1）。半径（pc）の対数（1 pc で 0.62、100 pc で 1） */
export const nebulaScale = (radiusPc: number): number => clamp(0.62 + 0.19 * Math.log10(Math.max(1e-6, radiusPc)), 0.4, 1);

// ── 彗星 ────────────────────────────────────────────

export interface CometPicture {
  /** 尾の長さと濃さ（0.2〜1）。全光度の絶対等級 M1（小さいほど明るい）から。17 等で 0.2、5 等より明るいと 1 */
  tail: number;
  /** 核のまわりの光（コマ）の大きさ（絵の幅を 1 として 0.1〜0.22）。核の直径の対数から */
  coma: number;
}

export function cometPicture(c: { m1: number | null; diameterKm: number | null }): CometPicture {
  return {
    tail: c.m1 === null ? 0.5 : clamp((17 - c.m1) / 12, 0.2, 1),
    coma: c.diameterKm === null ? 0.13 : clamp(0.1 + 0.06 * Math.log10(Math.max(1, c.diameterKm)), 0.1, 0.22),
  };
}

export const DEFAULT_COMET_PICTURE: CometPicture = cometPicture({ m1: null, diameterKm: null });
