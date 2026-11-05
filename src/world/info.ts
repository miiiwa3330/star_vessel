/**
 * 天体の情報（要件 F35〜F37）：種類の名前、情報のカードに出す説明、照準の先の天体を選ぶ計算。
 * 決まりは docs/product/info-and-collection.md。three.js・React を読み込まない。
 */
import { hygSystemCode } from './address';
import type { BodyInfo, BodyKind } from './solar-system';
import type { Cluster } from './clusters';
import type { Galaxy } from './galaxies';
import { NEBULA_TYPE_NAMES_JA, type Nebula } from './nebulae';
import type { HostStar } from './planets';
import { KM_PER_PC } from './units';
import type { Vec3 } from './vec';

/** 情報を出せるもの（天体の一覧の天体・恒星・星団）の種類。コレクションの種類にもなる */
export type InfoKind =
  | 'star'
  | 'white-dwarf'
  | 'neutron-star'
  | 'black-hole'
  | 'planet'
  | 'dwarf'
  | 'moon'
  | 'asteroid'
  | 'comet'
  | 'exoplanet'
  | 'satellite'
  | 'spacecraft'
  | 'cluster'
  | 'nebula'
  | 'galaxy';

export const INFO_KIND_NAMES_JA: Record<InfoKind, string> = {
  star: '恒星',
  'white-dwarf': '白色矮星',
  'neutron-star': '中性子星（パルサー）',
  'black-hole': 'ブラックホール',
  planet: '惑星',
  dwarf: '準惑星',
  moon: '衛星',
  asteroid: '小惑星',
  comet: '彗星',
  exoplanet: '系外惑星',
  satellite: '人工衛星',
  spacecraft: '探査機',
  cluster: '星団',
  nebula: '星雲',
  galaxy: '銀河',
};

/** 情報を出す相手 */
export interface InfoTarget {
  /** 重ならない記号（天体は天体の id、恒星は「恒星系の記号.0」、星団は「C:名前」） */
  key: string;
  name: string;
  kind: InfoKind;
  /** 太陽中心の EQJ（km） */
  positionKm: Vec3;
  /** 半径（km）。近くて大きく見えるとき、見えている円のどこを狙っても選べるようにする */
  radiusKm?: number;
  /** 情報のカードに出す説明（1 行ずつ）。カードに出すときだけ作る */
  details: () => string[];
}

const fmtKm = (km: number) =>
  km < 1 ? `${Math.round(km * 1000).toLocaleString('ja-JP')} m` : `${Math.round(km).toLocaleString('ja-JP')} km`;
const fmtPeriod = (days: number) =>
  days < 1 / 24 ? `${(days * 86_400).toPrecision(3)} 秒` : days < 2 ? `${(days * 24).toPrecision(3)} 時間` : days < 730 ? `${days.toPrecision(3)} 日` : `${(days / 365.25).toPrecision(3)} 年`;

/** 天体の一覧の天体の種類 */
export function bodyKind(b: BodyInfo): InfoKind {
  if (b.compact) return b.compact.kind;
  const map: Record<BodyKind, InfoKind> = {
    star: 'star',
    planet: 'planet',
    dwarf: 'dwarf',
    moon: 'moon',
    asteroid: 'asteroid',
    comet: 'comet',
    exoplanet: 'exoplanet',
    satellite: 'satellite',
    spacecraft: 'spacecraft',
    blackhole: 'black-hole',
  };
  return map[b.kind];
}

/** 自動で作った天体か（名前で見分ける。自動で作った星の恒星系 G…、名前が「第◯惑星」「…の第◯衛星」など） */
export function isGenerated(b: BodyInfo): boolean {
  return b.id.startsWith('G') || /^第\d+惑星/.test(b.nameJa) || /の第\d+衛星$/.test(b.nameJa) || /^恒星 [GHE]/.test(b.nameJa);
}

/** 天体の一覧の天体の、情報のカードの説明 */
export function describeBody(b: BodyInfo, parentName: string | null): string[] {
  const kind = bodyKind(b);
  const out: string[] = [];
  // 系外惑星とその衛星だけ、実在か自動で作ったかを書く（太陽系の天体はすべて実在）
  const exo = kind === 'exoplanet' || (kind === 'moon' && b.id !== 'Moon' && !b.id.startsWith('S'));
  const generated = exo && isGenerated(b);
  out.push(`${INFO_KIND_NAMES_JA[kind]}${generated ? '（自動で作った天体）' : ''}${parentName ? ` ・ ${parentName}のまわりを回る` : ''}`);
  if (kind === 'satellite' || kind === 'spacecraft') out.push(`大きさ 約 ${fmtKm(b.radiusKm * 2)}`);
  else if (kind === 'black-hole') out.push(`事象の地平面の半径 約 ${fmtKm(b.radiusKm)}`);
  else out.push(`半径 ${fmtKm(b.radiusKm)}`);
  if (b.motion.type === 'kepler') out.push(`公転周期 ${fmtPeriod(b.motion.elements.periodDays)}`);
  if (b.spin.type === 'steady') out.push(`自転周期 ${fmtPeriod(b.spin.periodHours / 24)}`);
  if (b.spin.type === 'locked') out.push('いつも同じ面を親の天体に向けている');
  const extras: string[] = [];
  if (b.atmosphere) extras.push('大気がある');
  if (b.rings) extras.push('環がある');
  if (b.compact?.disk) extras.push('光る降着円盤がある');
  if (extras.length) out.push(extras.join('・'));
  return out;
}

/** 恒星（恒星系の記号から引いた恒星）の、情報のカードの説明 */
export function describeHost(h: HostStar, name: string, planetCount: number): string[] {
  const distLy = (Math.hypot(h.positionPc.x, h.positionPc.y, h.positionPc.z) * KM_PER_PC) / 9.4607e12;
  const kind: InfoKind = h.compact ?? 'star';
  const out = [`${INFO_KIND_NAMES_JA[kind]}${h.system.startsWith('G') ? '（自動で作った星）' : ''} ・ ${name}`];
  out.push(`太陽から ${distLy < 100 ? distLy.toPrecision(3) : Math.round(distLy).toLocaleString('ja-JP')} 光年`);
  if (!h.compact) out.push(`絶対等級 ${h.absMag.toFixed(1)}`);
  if (h.compactInfo?.periodS) out.push(`自転周期 ${h.compactInfo.periodS.toPrecision(3)} 秒`);
  if (!h.compact) out.push(planetCount > 0 ? `惑星 ${planetCount} 個` : '惑星は無い');
  return out;
}

/** 星団の、情報のカードの説明 */
export function describeCluster(c: Cluster): string[] {
  const distLy = (Math.hypot(c.positionPc.x, c.positionPc.y, c.positionPc.z) * KM_PER_PC) / 9.4607e12;
  return [
    `${c.kind === 'globular' ? '球状星団' : '散開星団'} ・ ${c.name}`,
    `太陽から ${Math.round(distLy).toLocaleString('ja-JP')} 光年`,
    `半数の星が入る半径 ${((c.r50Pc * 3.2616) | 0).toLocaleString('ja-JP')} 光年`,
    `見つかっているメンバー ${c.members.toLocaleString('ja-JP')} 個`,
  ];
}

const fmtLy = (pc: number) => {
  const ly = pc * 3.2616;
  return ly < 100 ? `${ly.toPrecision(3)} 光年` : ly < 1e6 ? `${Math.round(ly).toLocaleString('ja-JP')} 光年` : `${(ly / 1e6).toPrecision(3)} 百万光年`;
};

/** 星雲の、情報のカードの説明 */
export function describeNebula(n: Nebula): string[] {
  return [
    `${NEBULA_TYPE_NAMES_JA[n.type]}${n.nameJa ? ` ・ ${n.name}` : ''}`,
    `太陽から ${fmtLy(Math.hypot(n.positionPc.x, n.positionPc.y, n.positionPc.z))}`,
    n.measured ? `半径 ${fmtLy(n.radiusPc)}` : `半径 約 ${fmtLy(n.radiusPc)}（典型的な値）`,
    '形は種類に合わせて作ったもの（位置と大きさは観測の値）',
  ];
}

/** 銀河の、情報のカードの説明 */
export function describeGalaxy(g: Galaxy): string[] {
  const t = g.tType;
  const type = t === null ? '銀河' : t <= -1 ? '楕円銀河・矮小楕円銀河' : t === 0 ? 'レンズ状銀河' : t <= 8 ? '渦巻銀河' : '不規則銀河';
  return [
    `${type}${g.nameJa ? ` ・ ${g.name}` : ''}`,
    `太陽から ${fmtLy(Math.hypot(g.positionPc.x, g.positionPc.y, g.positionPc.z))}`,
    `半径 ${fmtLy(g.radiusPc)}`,
    `絶対等級 ${g.absB.toFixed(1)}（B バンド）`,
    '星の並びは種類に合わせて作ったもの（位置・大きさ・明るさは観測の値）',
  ];
}

/**
 * 照準の先（画面の真ん中）の相手を選ぶ。forward は自分の見ている向き（単位ベクトル）。
 * 見ている向きとの角度（見かけの円のふちまでの角度）が maxDeg 以内のもののうち、いちばん小さいもの。
 * 見かけの円の中を見ているもの同士なら、近い方
 */
export function pickAimed(
  targets: readonly InfoTarget[],
  observerKm: Vec3,
  forward: Vec3,
  maxDeg = 3,
): InfoTarget | null {
  const maxRad = (maxDeg * Math.PI) / 180;
  let best: InfoTarget | null = null;
  let bestScore = Infinity;
  for (const t of targets) {
    const dx = t.positionKm.x - observerKm.x;
    const dy = t.positionKm.y - observerKm.y;
    const dz = t.positionKm.z - observerKm.z;
    const d = Math.hypot(dx, dy, dz);
    if (d === 0) continue;
    const c = Math.min(1, Math.max(-1, (dx * forward.x + dy * forward.y + dz * forward.z) / d));
    const angle = Math.acos(c);
    const angRadius = t.radiusKm ? Math.asin(Math.min(1, t.radiusKm / d)) : 0;
    const off = angle - angRadius;
    if (off > maxRad) continue;
    // 円の中なら距離で比べる（手前のもの）。外なら角度で（中のものより後ろ）
    const score = off <= 0 ? -1 / (1 + d) : off;
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

/** 恒星の記号（太陽は Sun、ほかは「恒星系の記号.0」。天体の一覧の恒星の id と同じ） */
export const starKey = (system: string): string => (system === 'SOL' ? 'Sun' : `${system}.0`);
/** 星団の記号 */
export const clusterKey = (c: Cluster): string => `C:${c.name}`;
/** コレクションの記号に使える文字だけにする（src/world/visits.ts の KEY） */
const safeKey = (s: string) => s.replace(/[^0-9A-Za-z.~:+\- ]/g, '').slice(0, 60);
export const nebulaKey = (n: Nebula): string => `N:${safeKey(n.name)}`;
export const galaxyKey = (g: Galaxy): string => `Y:${safeKey(g.name)}`;

/** 近くの恒星（恒星系の記号・位置〈pc〉・距離〈pc〉） */
export interface NearStar {
  system: string;
  positionPc: Vec3;
  distancePc: number;
}

/**
 * positionPc から近い恒星を、近い順に max 個。太陽（SOL）も入れる。
 * stars は STAR_STRIDE 個ずつ並んだ本物の星のデータ（x・y・z が pc、stride−1 番目が HYG の id）、extra はほかの星
 */
export function nearestStars(
  positionPc: Vec3,
  stars: Float32Array,
  stride: number,
  extra: readonly { position: Vec3; system: string }[],
  max: number,
): NearStar[] {
  // 星は 100 万個ほどあるので、ここは毎回の処理を軽くする（2 秒ごとに全部を調べるので、遅いと画面全体が引っかかる）。
  // 関数を作らず、距離は 2 乗のまま比べ、記号の文字列は近い方に入るときだけ作る
  const best: NearStar[] = [];
  const { x: px, y: py, z: pz } = positionPc;
  let worstD2 = Number.POSITIVE_INFINITY;
  const insert = (system: string, x: number, y: number, z: number, d2: number) => {
    const distancePc = Math.sqrt(d2);
    let i = best.length;
    while (i > 0 && best[i - 1].distancePc > distancePc) i--;
    best.splice(i, 0, { system, positionPc: { x, y, z }, distancePc });
    if (best.length > max) best.pop();
    if (best.length === max) worstD2 = best[max - 1].distancePc ** 2;
  };
  insert('SOL', 0, 0, 0, px * px + py * py + pz * pz);
  for (let o = 0; o + stride <= stars.length; o += stride) {
    const dx = stars[o] - px;
    const dy = stars[o + 1] - py;
    const dz = stars[o + 2] - pz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < worstD2) insert(hygSystemCode(stars[o + stride - 1]), stars[o], stars[o + 1], stars[o + 2], d2);
  }
  for (const g of extra) {
    const { x, y, z } = g.position;
    const d2 = (x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2;
    if (d2 < worstD2) insert(g.system, x, y, z, d2);
  }
  return best;
}
