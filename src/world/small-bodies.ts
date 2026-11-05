/**
 * 太陽系の衛星（要件 F20）と、大きな小惑星・準惑星（要件 F21）を、データから天体の一覧の形にする。
 *
 * - 衛星：public/data/moons.json（tools/build-moons.mjs が JPL の平均軌道要素から作る）
 * - 大きな小惑星・準惑星：public/data/asteroids-large.json（tools/build-asteroids.mjs が JPL SBDB から作る）
 * 決め方と出典は docs/tech/small-bodies.md。
 * 位置はケプラーの軌道（src/world/kepler.ts）。月とガリレオ衛星は astronomy-engine の方が正確なので、データからは作らない。
 */
import { periodDaysFromAxis, type KeplerElements } from './kepler';
import { diameterFromH, type NearbyAsteroid } from './asteroid-search';
import { hashInts, mulberry32 } from './random';
import type { Atmosphere, BodyInfo, BodyKind } from './solar-system';
import type { SurfaceLook } from './surface';
import { DEG, KM_PER_AU } from './units';
import { rotX, type Mat3, type Vec3 } from './vec';

/**
 * J2000.0 の黄道傾斜角。JPL（SBDB・Horizons・衛星の平均軌道要素）の黄道座標は IAU 1976 の値 84381.448″ を使うので、それに合わせる
 */
export const OBLIQUITY_J2000 = (84381.448 / 3600) * DEG;
/** 黄道座標（J2000）→ EQJ */
export const ECLIPTIC_TO_EQJ: Mat3 = rotX(OBLIQUITY_J2000);

/** 衛星の id の惑星の番号 → 惑星の天体の id */
const PLANET_OF: Record<number, string> = { 3: 'Earth', 4: 'Mars', 5: 'Jupiter', 6: 'Saturn', 7: 'Uranus', 8: 'Neptune', 9: 'Pluto' };
/** astronomy-engine で位置を出すので、データからは作らない衛星（月・ガリレオ衛星） */
const SKIP_CODES = new Set(['301', '501', '502', '503', '504']);

/** 大気のある衛星（タイタンだけ）。見た目のための値 */
const MOON_ATMOSPHERES: Record<string, Atmosphere> = {
  '606': { color: [1.0, 0.7, 0.35], thickness: 0.06, strength: 0.9 },
};

/** 質量の分からない天体を基準にする範囲は、半径の何倍か（src/world/solar-system.ts と同じ決まり） */
const ANCHOR_RADII_WITHOUT_MASS = 10;

export interface MoonRecord {
  code: string;
  planet: number;
  number: number;
  name: string;
  /** 日本語の名前（tools/build-moon-names.mjs が Wikidata から入れる。無ければ英語の名前） */
  nameJa?: string;
  /** 軌道要素の基準の面。いまは icrf（ICRF の赤道＝EQJ）だけ */
  frame: 'icrf';
  epoch: string;
  a: number;
  e: number;
  w: number;
  M: number;
  i: number;
  node: number;
  P: number;
  radius: number;
  gm: number | null;
  sizeSource: string;
}

/** JPL の元期の書き方（例：2000-01-01.5）を UNIX ミリ秒に（TDB と UTC の差の約 1 分は無視） */
export function parseEpoch(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(\.\d+)?$/.exec(s);
  if (!m) throw new Error(`元期の形が分からない: ${s}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + Number(m[4] ?? 0) * 86_400_000;
}

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** 赤経・赤緯（度）の向き（EQJ の単位ベクトル） */
export const raDecToVec = (raDeg: number, decDeg: number): Vec3 => ({
  x: Math.cos(decDeg * DEG) * Math.cos(raDeg * DEG),
  y: Math.cos(decDeg * DEG) * Math.sin(raDeg * DEG),
  z: Math.sin(decDeg * DEG),
});

export interface PlanetFacts {
  /** 惑星の GM（km³/s²） */
  gm: (planetId: string) => number;
}

/** 衛星のデータから天体を作る */
export function moonBodies(records: readonly MoonRecord[], facts: PlanetFacts): BodyInfo[] {
  const out: BodyInfo[] = [];
  for (const r of records) {
    if (SKIP_CODES.has(r.code)) continue;
    const parent = PLANET_OF[r.planet];
    if (!parent) continue;
    if (r.frame !== 'icrf') throw new Error(`軌道要素の基準の面が分からない: ${r.frame}`);
    const elements: KeplerElements = {
      aKm: r.a,
      e: r.e,
      iRad: r.i * DEG,
      nodeRad: r.node * DEG,
      periRad: r.w * DEG,
      meanAnomalyRad: r.M * DEG,
      epochMs: parseEpoch(r.epoch),
      periodDays: r.P,
      frame: IDENTITY,
    };
    const anchorRadiusKm =
      r.gm !== null
        ? Math.max(r.radius * 3, r.a * (r.gm / facts.gm(parent)) ** 0.4)
        : r.radius * ANCHOR_RADII_WITHOUT_MASS;
    out.push({
      id: `S${r.planet}.${r.number}`,
      nameJa: r.nameJa ?? r.name,
      radiusKm: r.radius,
      kind: 'moon',
      parent,
      motion: { type: 'kepler', parent, elements },
      spin: { type: 'locked' },
      anchorRadiusKm,
      atmosphere: MOON_ATMOSPHERES[r.code],
    });
  }
  return out;
}

export interface LargeAsteroid {
  number: number;
  name: string | null;
  nameJa: string | null;
  H: number;
  diameterKm: number;
  diameterSource: string;
  a: number;
  e: number;
  iDeg: number;
  nodeDeg: number;
  periDeg: number;
  meanAnomalyDeg: number;
  epochJd: number;
}

/** 光の点として描いている小さな小惑星を、近づいたときに球の天体にする（src/world/asteroid-search.ts） */
export function smallAsteroidBody(a: NearbyAsteroid): BodyInfo {
  const rand = mulberry32(hashInts(a.number, 0x41535452));
  const aKm = a.aAu * KM_PER_AU;
  const radiusKm = diameterFromH(a.H) / 2;
  return {
    id: `A${a.number}`,
    nameJa: `小惑星 (${a.number})`,
    radiusKm,
    kind: 'asteroid',
    parent: 'Sun',
    motion: {
      type: 'kepler',
      parent: 'Sun',
      elements: {
        aKm,
        e: a.e,
        iRad: a.iRad,
        nodeRad: a.nodeRad,
        periRad: a.periRad,
        meanAnomalyRad: a.meanAnomalyRad,
        epochMs: Date.UTC(2000, 0, 1, 12) + a.epochDays * 86_400_000,
        periodDays: periodDaysFromAxis(aKm, 1),
        frame: ECLIPTIC_TO_EQJ,
      },
    },
    spin: { type: 'steady', pole: raDecToVec(rand() * 360, Math.asin(2 * rand() - 1) / DEG), periodHours: 2 + 20 * rand(), phaseRad: rand() * 2 * Math.PI },
    anchorRadiusKm: radiusKm * ANCHOR_RADII_WITHOUT_MASS,
    surface: {
      look: { kind: 'rocky', colors: [[70, 66, 62], [120, 114, 108], [170, 164, 156]], craters: 0.5 },
      seed: hashInts(a.number, 7),
    },
  };
}

/** IAU が準惑星と認めている天体（冥王星は別に持つ） */
const DWARF_PLANETS = new Set([1, 136108, 136199, 136472]);
const JD_UNIX_EPOCH = 2_440_587.5;

/** 大きな小惑星・準惑星の天体。太陽のまわりのケプラーの軌道（黄道座標の要素）。自転は種から決める */
export function largeAsteroidBodies(list: readonly LargeAsteroid[]): BodyInfo[] {
  return list.map((a) => {
    const rand = mulberry32(hashInts(a.number, 0x41535452));
    const aKm = a.a * KM_PER_AU;
    const radiusKm = a.diameterKm / 2;
    const kind: BodyKind = DWARF_PLANETS.has(a.number) ? 'dwarf' : 'asteroid';
    const pole = raDecToVec(rand() * 360, Math.asin(2 * rand() - 1) / DEG);
    const look: SurfaceLook =
      a.a > 30
        ? { kind: 'rocky', colors: [[150, 120, 100], [210, 190, 170], [245, 240, 235]], craters: 0.15 }
        : { kind: 'rocky', colors: [[70, 66, 62], [120, 114, 108], [170, 164, 156]], craters: 0.5 };
    return {
      id: `A${a.number}`,
      nameJa: a.nameJa ?? a.name ?? `(${a.number})`,
      radiusKm,
      kind,
      parent: 'Sun',
      motion: {
        type: 'kepler',
        parent: 'Sun',
        elements: {
          aKm,
          e: a.e,
          iRad: a.iDeg * DEG,
          nodeRad: a.nodeDeg * DEG,
          periRad: a.periDeg * DEG,
          meanAnomalyRad: a.meanAnomalyDeg * DEG,
          epochMs: (a.epochJd - JD_UNIX_EPOCH) * 86_400_000,
          periodDays: periodDaysFromAxis(aKm, 1),
          frame: ECLIPTIC_TO_EQJ,
        },
      },
      spin: { type: 'steady', pole, periodHours: 5 + 20 * rand(), phaseRad: rand() * 2 * Math.PI },
      anchorRadiusKm: radiusKm * ANCHOR_RADII_WITHOUT_MASS,
      surface: { look, seed: hashInts(a.number, 7) },
    };
  });
}
