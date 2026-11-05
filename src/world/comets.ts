/**
 * 彗星（要件 F41）。データは public/data/comets.json（tools/build-comets.mjs が JPL の SBDB から作る）。決まりは docs/tech/small-bodies.md の「彗星」。
 * 近日点距離 q・離心率 e・近日点通過の時刻 tp から位置を出す。離心率 1 以上（放物線・双曲線。恒星間天体など）にも使える。
 * three.js・DOM を読み込まない。
 */
import { GM_SUN_KM3_S2, solveKepler } from './kepler';
import { hashInts, mulberry32 } from './random';
import { ECLIPTIC_TO_EQJ, raDecToVec } from './small-bodies';
import type { BodyInfo } from './solar-system';
import { DEG, KM_PER_AU } from './units';
import { mulMat, mulVec, rotX, rotZ, type Mat3, type Vec3 } from './vec';

export interface Comet {
  code: string;
  name: string;
  e: number;
  qAu: number;
  iDeg: number;
  nodeDeg: number;
  periDeg: number;
  /** 近日点を通る時刻（UNIX 日） */
  tpDays: number;
  /** 核の直径（km）。分からなければ null */
  diameterKm: number | null;
  /** 全光度の式 m = M1 + 5·log10(Δ) + K1·log10(r) の値。分からなければ null */
  m1: number | null;
  k1: number | null;
}

type Row = [string, string, number, number, number, number, number, number, number | null, number | null, number | null];

export const decodeComets = (json: { comets: Row[] }): Comet[] =>
  json.comets.map((r) => ({
    code: r[0],
    name: r[1],
    e: r[2],
    qAu: r[3],
    iDeg: r[4],
    nodeDeg: r[5],
    periDeg: r[6],
    tpDays: r[7],
    diameterKm: r[8],
    m1: r[9],
    k1: r[10],
  }));

const DAY_S = 86_400;
const DAY_MS = DAY_S * 1000;
const GM_AU3_DAY2 = (GM_SUN_KM3_S2 * DAY_S * DAY_S) / KM_PER_AU ** 3;

/** 双曲線のケプラーの方程式 M = e·sinh H − H を解く */
function solveHyperbolic(M: number, e: number): number {
  let H = Math.asinh(M / e);
  for (let k = 0; k < 60; k++) {
    const d = (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1);
    H -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return H;
}

/** 軌道の面の上の位置（AU。x が近日点の方向）。e≒1 は放物線（Barker の方程式） */
export function conicInPlane(qAu: number, e: number, daysSinceTp: number): { x: number; y: number } {
  if (Math.abs(e - 1) < 1e-9) {
    const W = 3 * Math.sqrt(GM_AU3_DAY2 / (2 * qAu ** 3)) * daysSinceTp;
    const Y = Math.cbrt(W + Math.sqrt(W * W + 1));
    const s = Y - 1 / Y;
    return { x: qAu * (1 - s * s), y: 2 * qAu * s };
  }
  if (e < 1) {
    const a = qAu / (1 - e);
    const M = Math.sqrt(GM_AU3_DAY2 / a ** 3) * daysSinceTp;
    const E = solveKepler(M, e);
    return { x: a * (Math.cos(E) - e), y: a * Math.sqrt(1 - e * e) * Math.sin(E) };
  }
  const a = qAu / (e - 1);
  const M = Math.sqrt(GM_AU3_DAY2 / a ** 3) * daysSinceTp;
  const H = solveHyperbolic(M, e);
  return { x: a * (e - Math.cosh(H)), y: a * Math.sqrt(e * e - 1) * Math.sinh(H) };
}

const ROT = new WeakMap<Comet, Mat3>();
const rotOf = (c: Comet): Mat3 => {
  let r = ROT.get(c);
  if (!r) {
    r = mulMat(ECLIPTIC_TO_EQJ, mulMat(rotZ(c.nodeDeg * DEG), mulMat(rotX(c.iDeg * DEG), rotZ(c.periDeg * DEG))));
    ROT.set(c, r);
  }
  return r;
};

/** 彗星の位置（太陽中心・EQJ・km） */
export function cometPositionKm(c: Comet, date: Date): Vec3 {
  const p = conicInPlane(c.qAu, c.e, date.getTime() / DAY_MS - c.tpDays);
  const v = mulVec(rotOf(c), { x: p.x, y: p.y, z: 0 });
  return { x: v.x * KM_PER_AU, y: v.y * KM_PER_AU, z: v.z * KM_PER_AU };
}

/** 核の半径が分からない彗星の半径（km）。木星族彗星の核の半径の典型的な値（1〜2 km）から置いた値 */
const DEFAULT_NUCLEUS_RADIUS_KM = 1.5;
/** 基準の天体にする範囲は半径の何倍か（小さな天体と同じ） */
const ANCHOR_RADII = 10;
/** よく知られた彗星の日本語の名前 */
const NAMES_JA: Readonly<Record<string, string>> = {
  C1P: 'ハレー彗星',
  C2P: 'エンケ彗星',
  C9P: 'テンペル第1彗星',
  C19P: 'ボレリー彗星',
  C21P: 'ジャコビニ・ジンナー彗星',
  C55P: 'テンペル・タットル彗星',
  C67P: 'チュリュモフ・ゲラシメンコ彗星',
  C81P: 'ビルト第2彗星',
  C103P: 'ハートレー第2彗星',
  C109P: 'スイフト・タットル彗星',
  C1I: 'オウムアムア',
  C2I: 'ボリソフ彗星',
  C3I: '3I/アトラス彗星',
  CC1995O1: 'ヘール・ボップ彗星',
  CC1996B2: '百武彗星',
  CC2020F3: 'ネオワイズ彗星',
  CC2023A3: '紫金山・アトラス彗星',
};
export const cometNameJa = (c: Comet): string => NAMES_JA[c.code] ?? `彗星 ${c.name}`;

/** 彗星を天体の一覧に入れる形にする（太陽の近く・自分の近くにあるものだけ入れる） */
export function cometBody(c: Comet): BodyInfo {
  const rand = mulberry32(hashInts(...Array.from(c.code, (ch) => ch.charCodeAt(0))));
  const radiusKm = c.diameterKm ? c.diameterKm / 2 : DEFAULT_NUCLEUS_RADIUS_KM;
  return {
    id: c.code,
    nameJa: cometNameJa(c),
    radiusKm,
    kind: 'comet',
    parent: 'Sun',
    motion: { type: 'custom', parent: 'Sun', relativeKm: (date) => cometPositionKm(c, date) },
    spin: {
      type: 'steady',
      pole: raDecToVec(rand() * 360, Math.asin(2 * rand() - 1) / DEG),
      periodHours: 5 + 40 * rand(),
      phaseRad: rand() * 2 * Math.PI,
    },
    anchorRadiusKm: radiusKm * ANCHOR_RADII,
    comet: { m1: c.m1 },
    surface: {
      look: { kind: 'rocky', colors: [[28, 26, 25], [52, 49, 46], [90, 86, 82]], craters: 0.3 },
      seed: rand() * 2 ** 31,
    },
  };
}

/**
 * 尾の長さ（km）。見た目のための近似：本物の尾は数百万〜1 億 km になるので、太陽に近いほど長く、4 AU より遠いと無い。
 * 明るさ M1 が分からない彗星は暗いものとして扱う
 */
export function tailLengthKm(c: Pick<Comet, 'm1'>, distanceFromSunKm: number): number {
  const r = distanceFromSunKm / KM_PER_AU;
  if (r >= TAIL_MAX_AU) return 0;
  const active = (TAIL_MAX_AU - r) / TAIL_MAX_AU;
  const size = Math.min(1, Math.max(0.1, (18 - (c.m1 ?? 18)) / 12));
  return 1.5e8 * size * active * active;
}
export const TAIL_MAX_AU = 4;

/** 太陽に近い彗星（尾が出る）と、自分の近くの彗星を選ぶ。太陽に近いものは明るい順に max 個まで */
export function activeComets(list: readonly Comet[], date: Date, observerKm: Vec3, nearKm: number, max: number): Comet[] {
  const near: { c: Comet; bright: number }[] = [];
  const close: Comet[] = [];
  for (const c of list) {
    const p = cometPositionKm(c, date);
    const r = Math.hypot(p.x, p.y, p.z) / KM_PER_AU;
    if (Math.hypot(p.x - observerKm.x, p.y - observerKm.y, p.z - observerKm.z) < nearKm) close.push(c);
    else if (r < TAIL_MAX_AU && c.qAu < TAIL_MAX_AU) near.push({ c, bright: (c.m1 ?? 18) + 2.5 * 4 * Math.log10(Math.max(r, 0.05)) });
  }
  near.sort((a, b) => a.bright - b.bright);
  return [...close, ...near.slice(0, Math.max(0, max - close.length)).map((n) => n.c)];
}
