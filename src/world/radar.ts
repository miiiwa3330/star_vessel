/**
 * レーダー（要件 F10）。自分の向きを基準にした円の中に、まわりの物を置く。
 *
 * - 円の上が、自分の進む方向（カメラの −Z）
 * - 中心からの距離は、実際の距離の対数（遠いほど縮める）。RADAR_RANGE の外は円のふちに置く
 * - 上下は円に描けないので、自分より上か下かだけを返す
 */
import type { BodyKind } from './solar-system';
import { rotateByInverse, type Quat } from './quat';
import { length, sub, type Vec3 } from './vec';

/** 点の形：天体（丸）・ほかの恒星（星）・ワープホール（ひし形）・ほかの船（三角） */
export type RadarKind = 'body' | 'star' | 'warp' | 'ship';

/**
 * マップに出すものの種類（2026-11-12。マップで切り替えられる。閉じたあとの小さなレーダーも同じものを出す）。
 * planets：恒星・惑星・準惑星・衛星、small：小惑星・彗星、craft：探査機・人工衛星、stars：近くのほかの恒星、ships：ほかのプレイヤー、warps：ワープホール
 */
export type MapLayer = 'planets' | 'small' | 'craft' | 'stars' | 'ships' | 'warps';
export const MAP_LAYERS: readonly { id: MapLayer; nameJa: string }[] = [
  { id: 'planets', nameJa: '惑星・衛星' },
  { id: 'small', nameJa: '小惑星・彗星' },
  { id: 'craft', nameJa: '探査機・人工衛星' },
  { id: 'stars', nameJa: 'ほかの恒星' },
  { id: 'ships', nameJa: 'プレイヤー' },
  { id: 'warps', nameJa: 'ワープホール' },
];
export const DEFAULT_MAP_LAYERS: Readonly<Record<MapLayer, boolean>> = {
  planets: true,
  small: true,
  craft: true,
  stars: true,
  ships: true,
  warps: true,
};

/** 天体の種類から、マップの種類へ */
export function mapLayerOfBody(kind: BodyKind): MapLayer {
  if (kind === 'asteroid' || kind === 'comet') return 'small';
  if (kind === 'satellite' || kind === 'spacecraft') return 'craft';
  return 'planets';
}

export interface RadarTarget {
  kind: RadarKind;
  /** マップで切り替える種類（省略すると、kind から決める：star → stars、warp → warps、ship → ships、body → planets） */
  layer?: MapLayer;
  id: string;
  label: string;
  /** 太陽中心・EQJ・km */
  positionKm: Vec3;
}

export interface RadarBlip {
  kind: RadarKind;
  layer: MapLayer;
  id: string;
  label: string;
  /** 円の中の位置。中心が (0, 0)、半径 1。y は上が正 */
  x: number;
  y: number;
  /** 自分の水平面での向き（長さ 1。真上・真下にあるときは 0, 0）。範囲を変えたときに置き直すため（radarPoint） */
  dirX: number;
  dirY: number;
  distanceKm: number;
  /** 自分の上下どちらにあるか */
  above: boolean;
  /** 範囲の外で、ふちに置いたか */
  clamped: boolean;
}

export interface RadarRange {
  minKm: number;
  maxKm: number;
}

/** 中心から 1,000 km 〜 ふちで 100 億 km（海王星の外まで）。マップの範囲を変えないときの値 */
export const RADAR_RANGE: RadarRange = { minKm: 1e3, maxKm: 1e10 };
/** 中心からふちまでの桁の数（範囲を変えても同じ。範囲を変えると、対数の目盛りがそのままずれる） */
const RADAR_DECADES = 7;
/**
 * マップの範囲（ふちの距離）の、変えられる幅（2026-11-12。二本指・ホイールで変える）。
 * 1 万 km（人工衛星・月のまわり）〜 1,000 兆 km（約 106 光年。近くの恒星まで）
 */
export const RADAR_MAX_KM_LIMITS = { min: 1e4, max: 1e15 } as const;

/** ふちの距離から、レーダーの範囲を作る（中心は、ふちの 1,000 万分の 1） */
export function radarRange(maxKm: number): RadarRange {
  const m = clampRadarMaxKm(maxKm);
  return { minKm: m / 10 ** RADAR_DECADES, maxKm: m };
}

/** ふちの距離を、変えられる幅に収める（数でないときは、ふだんの値） */
export function clampRadarMaxKm(maxKm: number): number {
  if (!Number.isFinite(maxKm)) return RADAR_RANGE.maxKm;
  return Math.min(RADAR_MAX_KM_LIMITS.max, Math.max(RADAR_MAX_KM_LIMITS.min, maxKm));
}

/** 距離と向きから、円の中の位置（範囲の外は、ふちに置く） */
export function radarPoint(distanceKm: number, dirX: number, dirY: number, range: RadarRange): { x: number; y: number; clamped: boolean } {
  const raw = Math.log(Math.max(distanceKm, range.minKm) / range.minKm) / Math.log(range.maxKm / range.minKm);
  const r = Math.min(1, raw);
  return { x: r * dirX, y: r * dirY, clamped: raw > 1 };
}

/** 目盛りの輪の半径（円の中の、中心からの距離） */
export function radarRingRadius(km: number, range: RadarRange): number {
  return Math.log(km / range.minKm) / Math.log(range.maxKm / range.minKm);
}

/**
 * 目盛りの輪（km）。10 の累乗の距離に、ふちの内側から 2 桁おきに 3 本（ふだんの範囲では 10 億・1,000 万・10 万 km）。
 * ふちにぴったり重なる輪は出さない
 */
export function radarRings(range: RadarRange): number[] {
  // 1e-9 は、ふちがちょうど 10 の累乗のとき、ふちの上に輪を出さないため
  const top = Math.floor(Math.log10(range.maxKm) - 1e-9);
  const out: number[] = [];
  for (let e = top; out.length < 3 && 10 ** e > range.minKm * 10; e -= 2) out.push(10 ** e);
  return out;
}

/** 目盛りの輪の名前（10 の累乗の km を、万・億・兆で短く。例：10万km・1千万km・1千兆km） */
export function formatRingKm(km: number): string {
  const e = Math.round(Math.log10(km));
  if (e < 4) return `${(10 ** e).toLocaleString('ja-JP')}km`;
  const units: [number, string][] = [
    [12, '兆'],
    [8, '億'],
    [4, '万'],
  ];
  const [base, unit] = units.find(([b]) => e >= b)!;
  const rest = e - base;
  const head = rest === 3 ? '1千' : rest === 2 ? '100' : rest === 1 ? '10' : '1';
  // 1,000 兆より大きい数は 兆 のまま桁を並べる
  return `${rest > 3 ? String(10 ** rest) : head}${unit}km`;
}

const defaultLayer = (kind: RadarKind): MapLayer =>
  kind === 'star' ? 'stars' : kind === 'warp' ? 'warps' : kind === 'ship' ? 'ships' : 'planets';

export function radarBlips(
  observerKm: Vec3,
  orientation: Quat,
  targets: readonly RadarTarget[],
  range = RADAR_RANGE,
): RadarBlip[] {
  return targets.map((t) => {
    const rel = sub(t.positionKm, observerKm);
    const distanceKm = length(rel);
    const local = rotateByInverse(orientation, rel);
    // 自分の水平面（右：+x、前：−z）に落とした向き
    const right = local.x;
    const forward = -local.z;
    const planar = Math.hypot(right, forward);
    const dirX = planar > 0 ? right / planar : 0;
    const dirY = planar > 0 ? forward / planar : 0;
    return {
      kind: t.kind,
      layer: t.layer ?? defaultLayer(t.kind),
      id: t.id,
      label: t.label,
      ...radarPoint(distanceKm, dirX, dirY, range),
      dirX,
      dirY,
      distanceKm,
      above: local.y >= 0,
    };
  });
}

/** 点を、別の範囲で置き直す（マップの範囲を変えている間、世界の更新を待たずに描くため） */
export function placeBlips(blips: readonly RadarBlip[], range: RadarRange): RadarBlip[] {
  return blips.map((b) => ({ ...b, ...radarPoint(b.distanceKm, b.dirX, b.dirY, range) }));
}

/** 名前を出せる点（レーダーの座標。上が +y）と、優先の順（小さいほど先） */
export interface RadarLabelCandidate {
  id: string;
  x: number;
  y: number;
  label: string;
  priority: number;
}

/**
 * レーダーに名前を出す点を選ぶ。優先の高い順に、ほかの名前・点の印と重ならないものだけ、最大 max 個。
 * 名前は点の右に置き、幅は 1 文字 charW（全角の文字の幅。半角は半分）、高さ lineH とみなす（レーダーの座標の単位）。
 * dots はレーダーのすべての点の印（名前が印を隠さないように、その点以外の印にかかる名前は出さない）
 */
export function chooseRadarLabels(
  candidates: readonly RadarLabelCandidate[],
  max: number,
  dots: readonly { x: number; y: number }[] = [],
  charW = 0.09,
  lineH = 0.1,
  dotR = 0.035,
): Set<string> {
  const chosen = new Set<string>();
  const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const width = (s: string) => [...s].reduce((w, c) => w + (c.charCodeAt(0) < 0x100 ? charW * 0.55 : charW), 0);
  for (const c of [...candidates].sort((a, b) => a.priority - b.priority)) {
    if (chosen.size >= max) break;
    const box = { x0: c.x + 0.05, x1: c.x + 0.06 + width(c.label), y0: c.y - lineH / 2, y1: c.y + lineH / 2 };
    // レーダーの円の外にはみ出す名前は出さない
    if (Math.hypot(box.x1, c.y) > 1.1) continue;
    if (boxes.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) continue;
    const hitsDot = dots.some(
      (d) => (d.x !== c.x || d.y !== c.y) && d.x + dotR > box.x0 && d.x - dotR < box.x1 && d.y + dotR > box.y0 && d.y - dotR < box.y1,
    );
    if (hitsDot) continue;
    boxes.push(box);
    chosen.add(c.id);
  }
  return chosen;
}
