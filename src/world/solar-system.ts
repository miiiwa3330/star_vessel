/**
 * 天体の「いま」の位置と向き。太陽系の天体と、いる恒星系の系外惑星を、同じ形で扱う。
 *
 * astronomy-engine はこのファイルの中だけで使う（AGENTS.md：計算ライブラリは自分たちの関数で包む）。
 * 座標系は J2000 の赤道座標系（EQJ）・太陽中心・単位 km。
 *
 * 天体は一覧（registry）に登録して使う。最初から入っているのは太陽・惑星・冥王星・月・木星のガリレオ衛星。
 * 系外惑星は、いる恒星系が変わるたびに src/world/planets.ts が入れ替える。
 * 一覧に無い天体（遠くの恒星系の惑星など）は、setBodyResolver で渡した関数に聞く。
 */
import { Body, HelioVector, JupiterMoons, MassProduct, RotationAxis, Rotation_EQD_EQJ } from 'astronomy-engine';
import {
  CALLISTO_RADIUS_KM,
  EUROPA_RADIUS_KM,
  GANYMEDE_RADIUS_KM,
  IO_RADIUS_KM,
} from 'astronomy-engine';
import { keplerPositionKm, orbitNormal, orbitToEqj, type KeplerElements } from './kepler';
import { DEG, KM_PER_AU } from './units';
import { add, length, mulMat, normalize, rotX, rotZ, scale, sub, type Mat3, type Vec3 } from './vec';
import type { RingZone, SurfaceLook } from './surface';
import type { CompactLook } from './compact-objects';

/**
 * 天体の名前（id）。太陽系の主な天体は英語の名前（Earth など）、ほかは住所の番号を含む記号。
 * 決め方は src/world/address.ts の bodyAddress と docs/tech/world-model.md の「天体の id」
 */
export type BodyId = string;

export type BodyKind = 'star' | 'planet' | 'dwarf' | 'moon' | 'asteroid' | 'comet' | 'exoplanet' | 'satellite' | 'spacecraft' | 'blackhole';

/** 位置の決め方 */
export type Motion =
  /** astronomy-engine の HelioVector（太陽・惑星・冥王星・月） */
  | { type: 'major' }
  /** astronomy-engine の JupiterMoons（0：イオ・1：エウロパ・2：ガニメデ・3：カリスト） */
  | { type: 'jupiter-moon'; index: 0 | 1 | 2 | 3 }
  /** 親の天体のまわりのケプラーの軌道 */
  | { type: 'kepler'; parent: BodyId; elements: KeplerElements }
  /** 動かない（系外の恒星。太陽中心の位置 km） */
  | { type: 'fixed'; positionKm: Vec3 }
  /** 親の天体からの位置を関数で出す（人工衛星。src/world/satellites.ts） */
  | { type: 'custom'; parent: BodyId; relativeKm: (date: Date) => Vec3 };

/** 向き（自転）の決め方 */
export type Spin =
  /** astronomy-engine の RotationAxis（IAU の定義） */
  | { type: 'major' }
  /** 親の天体にいつも同じ面を向ける（潮汐ロック。多くの衛星） */
  | { type: 'locked' }
  /** 決まった軸のまわりに一定の速さで回る */
  | { type: 'steady'; pole: Vec3; periodHours: number; phaseRad: number };

export interface BodyInfo {
  id: BodyId;
  nameJa: string;
  /** 平均半径（km）。出典は docs/tech/world-model.md の「天体の大きさ」 */
  radiusKm: number;
  kind: BodyKind;
  /** 回っている相手（太陽系の惑星は Sun、衛星は惑星）。恒星は null */
  parent: BodyId | null;
  motion: Motion;
  spin: Spin;
  /** この範囲（中心からの km）の中にいる間は、この天体を基準にする（src/world/observer.ts）。無ければ基準にしない */
  anchorRadiusKm?: number;
  /** 画像が無いときに自動で描く模様（系外惑星など）。太陽系の主な天体は src/render/body-looks.ts */
  surface?: { look: SurfaceLook; seed: number };
  /** 環（赤道の面） */
  rings?: readonly RingZone[];
  /** 環の色（0〜255 の RGB）。無ければ土星の環の色 */
  ringColor?: readonly [number, number, number];
  /** 光る天体（恒星）の色（0〜1 の RGB） */
  glow?: readonly [number, number, number];
  /** 大気（ふちに光の輪を描く）。見た目のための値 */
  atmosphere?: Atmosphere;
  /** 彗星の尾の長さを決める値（src/world/comets.ts の tailLengthKm） */
  comet?: { m1: number | null };
  /** 星の燃えかす（白色矮星・中性子星・ブラックホール）の見た目。src/world/compact-objects.ts */
  compact?: CompactLook;
}

export interface Atmosphere {
  /** 色（0〜1 の RGB） */
  color: readonly [number, number, number];
  /** 光の輪の厚さ（半径に対する割合） */
  thickness: number;
  /** 明るさ（0〜1 くらい） */
  strength: number;
}

/**
 * 太陽系の大気の見た目（要件 F25）。色・厚さ・明るさは見た目のための値で、観測の値ではない。
 * 厚さは本物の大気の高さ（地球で数十 km）より厚くしている。本物どおりだと 1 ピクセルにもならないため
 */
const SOL_ATMOSPHERES: Record<string, Atmosphere> = {
  Earth: { color: [0.35, 0.6, 1.0], thickness: 0.025, strength: 1 },
  Venus: { color: [1.0, 0.9, 0.65], thickness: 0.03, strength: 0.9 },
  Mars: { color: [0.95, 0.6, 0.45], thickness: 0.015, strength: 0.35 },
  Jupiter: { color: [0.95, 0.85, 0.7], thickness: 0.012, strength: 0.5 },
  Saturn: { color: [0.95, 0.88, 0.65], thickness: 0.012, strength: 0.5 },
  Uranus: { color: [0.6, 0.9, 0.95], thickness: 0.02, strength: 0.6 },
  Neptune: { color: [0.4, 0.6, 1.0], thickness: 0.02, strength: 0.6 },
};

/**
 * 土星の環（赤道の面にある）。半径は NASA の Saturnian Rings Fact Sheet の主な環の範囲（km）。
 * 濃さ（opacity）は見た目のための値で、観測の光学的厚さを 0〜1 に丸めたおおよその並び（B 環がいちばん濃い）
 */
export const SATURN_RINGS: readonly RingZone[] = [
  { innerKm: 66_900, outerKm: 74_510, opacity: 0.05 }, // D 環
  { innerKm: 74_658, outerKm: 92_000, opacity: 0.3 }, // C 環
  { innerKm: 92_000, outerKm: 117_580, opacity: 0.95 }, // B 環
  { innerKm: 117_580, outerKm: 122_170, opacity: 0.08 }, // カッシーニの間隙
  { innerKm: 122_170, outerKm: 136_775, opacity: 0.65 }, // A 環
];

/**
 * 木星・天王星・海王星の環（赤道の面）。半径は NASA の Rings Fact Sheet（Jupiter・Uranus・Neptune。2026-11-05 に確かめた）。
 * 本物の環はとても薄くて暗く（光学的厚さ：木星 10⁻⁶ 前後、天王星のイプシロン環でも 2 程度）、本物どおりだと見えない。
 * 濃さ（opacity）は、並びを保った見た目のための値。細い環は、幅が狭いほど画像の 1 列で薄くなる（paintRing）
 */
export const JUPITER_RINGS: readonly RingZone[] = [
  { innerKm: 89_400, outerKm: 123_000, opacity: 0.04 }, // ハロー
  { innerKm: 123_000, outerKm: 128_940, opacity: 0.22 }, // 主環
  { innerKm: 128_940, outerKm: 181_350, opacity: 0.03 }, // アマルテア環
  { innerKm: 181_350, outerKm: 221_900, opacity: 0.02 }, // テーベ環
];
const narrow = (radiusKm: number, widthKm: number, opacity: number): RingZone => ({ innerKm: radiusKm - widthKm / 2, outerKm: radiusKm + widthKm / 2, opacity });
/** 天王星の環。細い環の幅は NASA の表の値（幅に範囲があるものは大きい方）のままだと見えないので、見た目のために 30 km より細くしない */
export const URANUS_RINGS: readonly RingZone[] = [
  narrow(41_837, 30, 0.5), // 6
  narrow(42_234, 30, 0.6), // 5
  narrow(42_571, 30, 0.5), // 4
  narrow(44_718, 30, 0.6), // アルファ
  narrow(45_661, 30, 0.5), // ベータ
  narrow(47_176, 30, 0.5), // エータ
  narrow(47_627, 30, 0.5), // ガンマ
  narrow(48_300, 30, 0.6), // デルタ
  narrow(50_024, 30, 0.3), // ラムダ
  narrow(51_149, 96, 0.95), // イプシロン
  narrow(67_300, 3_800, 0.012), // R/2003 U 2（ミュー環の内側）
  narrow(97_700, 17_000, 0.008), // R/2003 U 1
];
/** 海王星の環。アダムス環のアーク（濃い部分）は描いていない */
export const NEPTUNE_RINGS: readonly RingZone[] = [
  narrow(41_900, 2_000, 0.03), // ガレ
  narrow(53_200, 100, 0.25), // ルベリエ
  narrow(55_200, 4_000, 0.015), // ラッセル（ルベリエからアラゴまで）
  narrow(57_200, 100, 0.08), // アラゴ
  narrow(62_933, 50, 0.4), // アダムス
];
/** 環の色。どれも暗い（NASA の表で反射率は土星よりずっと小さい）。見た目のための値 */
const DARK_RING_COLOR = [150, 140, 130] as const;

/**
 * 影響圏（km）。Laplace の影響圏 r = a·(m/M)^(2/5) の値。出典は docs/tech/world-model.md。
 * 太陽は影響圏の外すべて（ここには書かない）。
 */
const SOI_KM: Record<string, number> = {
  Mercury: 1.12e5,
  Venus: 6.16e5,
  Earth: 9.25e5,
  Moon: 6.61e4,
  Mars: 5.77e5,
  Jupiter: 4.82e7,
  Saturn: 5.48e7,
  Uranus: 5.18e7,
  Neptune: 8.66e7,
  Pluto: 3.08e6,
};

/**
 * 質量の分からない衛星を基準にする範囲は、半径の何倍か。
 * 決まりとして置いた値（観測の値ではない）。ガリレオ衛星の Laplace の影響圏は半径の約 4〜16 倍
 */
export const ANCHOR_RADII_WITHOUT_MASS = 10;

const major = (id: string, nameJa: string, radiusKm: number, kind: BodyKind, parent: BodyId | null): BodyInfo => ({
  id,
  nameJa,
  radiusKm,
  kind,
  parent,
  motion: { type: 'major' },
  spin: { type: 'major' },
  anchorRadiusKm: SOI_KM[id],
  atmosphere: SOL_ATMOSPHERES[id],
});

const galilean = (id: string, nameJa: string, radiusKm: number, index: 0 | 1 | 2 | 3): BodyInfo => ({
  id,
  nameJa,
  radiusKm,
  kind: 'moon',
  parent: 'Jupiter',
  motion: { type: 'jupiter-moon', index },
  spin: { type: 'locked' },
  anchorRadiusKm: radiusKm * ANCHOR_RADII_WITHOUT_MASS,
});

/** 最初から入っている天体 */
export const CORE_BODIES: readonly BodyInfo[] = [
  { ...major('Sun', '太陽', 695_700, 'star', null), glow: [1, 0.95, 0.85] },
  major('Mercury', '水星', 2_439.7, 'planet', 'Sun'),
  major('Venus', '金星', 6_051.8, 'planet', 'Sun'),
  major('Earth', '地球', 6_371.0, 'planet', 'Sun'),
  major('Moon', '月', 1_737.4, 'moon', 'Earth'),
  major('Mars', '火星', 3_389.5, 'planet', 'Sun'),
  { ...major('Jupiter', '木星', 69_911, 'planet', 'Sun'), rings: JUPITER_RINGS, ringColor: DARK_RING_COLOR },
  { ...major('Saturn', '土星', 58_232, 'planet', 'Sun'), rings: SATURN_RINGS },
  { ...major('Uranus', '天王星', 25_362, 'planet', 'Sun'), rings: URANUS_RINGS, ringColor: DARK_RING_COLOR },
  { ...major('Neptune', '海王星', 24_622, 'planet', 'Sun'), rings: NEPTUNE_RINGS, ringColor: DARK_RING_COLOR },
  major('Pluto', '冥王星', 1_188.3, 'dwarf', 'Sun'),
  // 木星の衛星（ガリレオ衛星）。id は住所の番号（木星＝5 の I〜IV）。半径は astronomy-engine の値
  galilean('S5.1', 'イオ', IO_RADIUS_KM, 0),
  galilean('S5.2', 'エウロパ', EUROPA_RADIUS_KM, 1),
  galilean('S5.3', 'ガニメデ', GANYMEDE_RADIUS_KM, 2),
  galilean('S5.4', 'カリスト', CALLISTO_RADIUS_KM, 3),
];

const registry = new Map<BodyId, BodyInfo>(CORE_BODIES.map((b) => [b.id, b]));
let resolver: (id: BodyId) => BodyInfo | null = () => null;
/** 一覧が変わった回数（描画が作り直しを知るため） */
let version = 0;

/** いま一覧にある天体（描画・衝突・基準の天体・レーダーに使う） */
export const allBodies = (): BodyInfo[] => [...registry.values()];
export const bodiesVersion = (): number => version;

export function registerBodies(list: readonly BodyInfo[]): void {
  for (const b of list) registry.set(b.id, b);
  version++;
  clearCache();
}

export function unregisterBodies(ids: readonly BodyId[]): void {
  for (const id of ids) registry.delete(id);
  version++;
  clearCache();
}

/** 一覧に無い天体を調べる関数を渡す（遠くの恒星系の惑星に置かれたワープホールの位置などに使う） */
export function setBodyResolver(fn: (id: BodyId) => BodyInfo | null): void {
  resolver = fn;
  clearCache();
}

export function findBody(id: BodyId): BodyInfo | null {
  return registry.get(id) ?? resolver(id);
}

export const bodyInfo = (id: BodyId): BodyInfo => {
  const info = findBody(id);
  if (!info) throw new Error(`unknown body: ${id}`);
  return info;
};

// ── 位置 ────────────────────────────────────────────

/** 同じ時刻の位置は何度も聞かれるので、時刻ごとに覚えておく */
let cacheTime = Number.NaN;
const cache = new Map<BodyId, Vec3>();
function clearCache() {
  cacheTime = Number.NaN;
  cache.clear();
}

let jupiterMoonsTime = Number.NaN;
let jupiterMoons: ReturnType<typeof JupiterMoons> | null = null;
function jupiterMoonState(index: 0 | 1 | 2 | 3, date: Date) {
  if (jupiterMoonsTime !== date.getTime() || !jupiterMoons) {
    jupiterMoons = JupiterMoons(date);
    jupiterMoonsTime = date.getTime();
  }
  return [jupiterMoons.io, jupiterMoons.europa, jupiterMoons.ganymede, jupiterMoons.callisto][index];
}

const ROT_CACHE = new WeakMap<KeplerElements, Mat3>();
function keplerRot(el: KeplerElements): Mat3 {
  let r = ROT_CACHE.get(el);
  if (!r) {
    r = orbitToEqj(el);
    ROT_CACHE.set(el, r);
  }
  return r;
}

/** 太陽から見た天体の位置（km・EQJ）。光の届く時間の補正はしない（見た目には影響しない） */
export function heliocentricPositionKm(id: BodyId, date: Date): Vec3 {
  if (date.getTime() !== cacheTime) {
    cache.clear();
    cacheTime = date.getTime();
  }
  const hit = cache.get(id);
  if (hit) return hit;
  const p = computePosition(bodyInfo(id), date);
  cache.set(id, p);
  return p;
}

function computePosition(b: BodyInfo, date: Date): Vec3 {
  const m = b.motion;
  switch (m.type) {
    case 'major': {
      if (b.id === 'Sun') return { x: 0, y: 0, z: 0 };
      const v = HelioVector(Body[b.id as keyof typeof Body], date);
      return { x: v.x * KM_PER_AU, y: v.y * KM_PER_AU, z: v.z * KM_PER_AU };
    }
    case 'jupiter-moon': {
      const s = jupiterMoonState(m.index, date);
      return add(heliocentricPositionKm('Jupiter', date), { x: s.x * KM_PER_AU, y: s.y * KM_PER_AU, z: s.z * KM_PER_AU });
    }
    case 'kepler':
      return add(heliocentricPositionKm(m.parent, date), keplerPositionKm(m.elements, date, keplerRot(m.elements)));
    case 'fixed':
      return m.positionKm;
    case 'custom':
      return add(heliocentricPositionKm(m.parent, date), m.relativeKm(date));
  }
}

// ── 向き ────────────────────────────────────────────

const fromAxes = (x: Vec3, y: Vec3, z: Vec3): Mat3 => [x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z];
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** 軸 pole に垂直な、決まった向きの x 軸（EQJ の北極との外積。北極と同じ向きなら EQJ の x 軸） */
function equatorAxes(pole: Vec3): { x: Vec3; y: Vec3 } {
  const c = cross({ x: 0, y: 0, z: 1 }, pole);
  const x = length(c) > 1e-9 ? normalize(c) : { x: 1, y: 0, z: 0 };
  return { x, y: cross(pole, x) };
}

/** 公転の面の北（衛星の潮汐ロックに使う） */
function orbitPole(b: BodyInfo, date: Date): Vec3 {
  const m = b.motion;
  if (m.type === 'kepler') return orbitNormal(m.elements);
  if (m.type === 'jupiter-moon') {
    const s = jupiterMoonState(m.index, date);
    return normalize(cross({ x: s.x, y: s.y, z: s.z }, { x: s.vx, y: s.vy, z: s.vz }));
  }
  return { x: 0, y: 0, z: 1 };
}

/**
 * 天体に固定した座標（x：本初子午線・y：東経90度・z：北極）を EQJ に移す回転行列。
 *
 * 太陽系の主な天体は、IAU（WGCCRE 2015）の定義どおり R = Rz(α0 + 90°) · Rx(90° − δ0) · Rz(W)。
 * α0・δ0 は北極の向き、W は本初子午線の回った角度で、どれも時刻から決まる。
 * 潮汐ロックの天体は、本初子午線をいつも親の天体に向ける（月と同じ決め方）。
 */
export function bodyFixedToEqj(id: BodyId, date: Date): Mat3 {
  const b = bodyInfo(id);
  const s = b.spin;
  if (s.type === 'major') {
    const axis = RotationAxis(Body[id as keyof typeof Body], date);
    const alpha = axis.ra * 15 * DEG;
    const delta = axis.dec * DEG;
    const w = axis.spin * DEG;
    return mulMat(rotZ(alpha + Math.PI / 2), mulMat(rotX(Math.PI / 2 - delta), rotZ(w)));
  }
  if (s.type === 'locked' && b.parent) {
    const toParent = normalize(sub(heliocentricPositionKm(b.parent, date), heliocentricPositionKm(id, date)));
    const pole = orbitPole(b, date);
    const y = normalize(cross(pole, toParent));
    return fromAxes(toParent, y, cross(toParent, y));
  }
  if (s.type === 'steady') {
    const pole = normalize(s.pole);
    const { x, y } = equatorAxes(pole);
    const w = s.phaseRad + (2 * Math.PI * date.getTime()) / (s.periodHours * 3_600_000);
    const c = Math.cos(w);
    const sn = Math.sin(w);
    return fromAxes(add(scale(x, c), scale(y, sn)), add(scale(y, c), scale(x, -sn)), pole);
  }
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

// ── 衛星・小惑星のデータから天体を作るための値（src/world/small-bodies.ts） ──────

/** 太陽系の主な天体の GM（km³/s²）。astronomy-engine の値（AU³/日² を換算） */
export function majorGmKm3s2(id: BodyId): number {
  return (MassProduct(Body[id as keyof typeof Body]) * KM_PER_AU ** 3) / 86_400 ** 2;
}

/**
 * その時刻の真の赤道・真の春分点の座標（EQD）→ EQJ の回転。人工衛星の軌道計算（SGP4）の座標（TEME）を EQJ に移すのに使う。
 * TEME と EQD の違い（分点差。1 秒角ほど）は無視する
 */
export function eqdToEqj(date: Date): Mat3 {
  const r = Rotation_EQD_EQJ(date).rot;
  // astronomy-engine の rot[i][j] は「i 番目の入力の軸が、出力の j 成分にどう写るか」（列ベクトルの並び）
  return [r[0][0], r[1][0], r[2][0], r[0][1], r[1][1], r[2][1], r[0][2], r[1][2], r[2][2]];
}
