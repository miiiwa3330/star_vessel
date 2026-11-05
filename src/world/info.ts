/**
 * 天体の情報（要件 F35〜F37）：種類の名前、情報のカードに出す説明、照準の先の天体を選ぶ計算。
 * 決まりは docs/product/info-and-collection.md。three.js・React を読み込まない。
 */
import type { BodyInfo, BodyKind } from './solar-system';
import type { Cluster } from './clusters';
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
  | 'exoplanet'
  | 'satellite'
  | 'cluster';

export const INFO_KIND_NAMES_JA: Record<InfoKind, string> = {
  star: '恒星',
  'white-dwarf': '白色矮星',
  'neutron-star': '中性子星（パルサー）',
  'black-hole': 'ブラックホール',
  planet: '惑星',
  dwarf: '準惑星',
  moon: '衛星',
  asteroid: '小惑星',
  exoplanet: '系外惑星',
  satellite: '人工衛星',
  cluster: '星団',
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
    exoplanet: 'exoplanet',
    satellite: 'satellite',
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
  if (kind === 'satellite') out.push(`大きさ 約 ${fmtKm(b.radiusKm * 2)}`);
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
  const best: NearStar[] = [];
  // 記号の文字列は、近い方に入るときだけ作る（星は 10 万個以上あるため）
  const consider = (system: () => string, x: number, y: number, z: number) => {
    const d = Math.hypot(x - positionPc.x, y - positionPc.y, z - positionPc.z);
    if (best.length === max && d >= best[max - 1].distancePc) return;
    const item = { system: system(), positionPc: { x, y, z }, distancePc: d };
    let i = best.length;
    while (i > 0 && best[i - 1].distancePc > d) i--;
    best.splice(i, 0, item);
    if (best.length > max) best.pop();
  };
  consider(() => 'SOL', 0, 0, 0);
  for (let o = 0; o + stride <= stars.length; o += stride) consider(() => `H${stars[o + stride - 1]}`, stars[o], stars[o + 1], stars[o + 2]);
  for (const g of extra) consider(() => g.system, g.position.x, g.position.y, g.position.z);
  return best;
}
