/**
 * 太陽系の外の恒星系の天体（恒星と惑星）を作る（要件 F22〜F24）。
 *
 * - 実在の系外惑星のデータ（src/world/exoplanet-data.ts）がある恒星は、その惑星を置く
 * - それ以外の恒星は、恒星系の記号を種にして惑星を自動で作る。同じ恒星なら誰の端末でも同じ惑星になる
 * - 惑星の番号は恒星に近い順（住所の惑星の番号。src/world/address.ts）
 * - 公転はケプラーの軌道で、現実の時刻に合わせて動かす（src/world/kepler.ts）
 *
 * 数の出典と、自動で作る決まりは docs/tech/exoplanets.md。
 * three.js・DOM・astronomy-engine を読み込まない。
 */
import { exoplanetId } from './address';
import { axisKmFromPeriod, meanAnomalyFromTrue, type KeplerElements } from './kepler';
import type { RealPlanet, RealSystem } from './exoplanet-data';
import { hashInts, mulberry32 } from './random';
import type { BodyInfo, Spin } from './solar-system';
import type { Rgb, SurfaceLook } from './surface';
import { DEG, KM_PER_AU, KM_PER_PC } from './units';
import { length, normalize, scale, type Mat3, type Vec3 } from './vec';

/** 自動で作る決まりの世代（要件 F24）。決まりを変えるときは、前の世代の作り方を残して数を増やす */
export const PLANET_GENERATION = 1;

/** 木星・地球の赤道半径（km）、太陽の半径（km）。IAU 2015 の公称値 */
export const R_JUPITER_KM = 71_492;
export const R_EARTH_KM = 6_378.1;
export const R_SUN_KM = 695_700;
/** 木星・地球の質量（太陽質量）。IAU 2015 の公称値の GM の比 */
export const M_JUPITER_SUN = 1 / 1047.348644;
export const M_EARTH_SUN = 1 / 332_946.0487;
/** 太陽の有効温度（K）。IAU 2015 の公称値 */
const T_SUN = 5772;
/** J2000.0（2000-01-01T12:00:00 TT）を UNIX ミリ秒にしたもの（TT と UTC の差は無視） */
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const JD_UNIX_EPOCH = 2_440_587.5;

export interface HostStar {
  /** 恒星系の記号 */
  system: string;
  /** 太陽中心の EQJ（pc） */
  positionPc: Vec3;
  absMag: number;
  bv: number;
}

// ── 恒星のおおよその性質（色と明るさから） ──────────────────

/** 色指数 B−V から有効温度（K）。Ballesteros（2012）の式 */
export const teffFromBv = (bv: number): number => 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));

/**
 * 主系列星の絶対等級（V）と質量（太陽質量）のおおよその対応。
 * Pecaut & Mamajek（2013）の主系列の表から、主なスペクトル型の値を拾ったもの（間は直線でつなぐ）
 */
const MAIN_SEQUENCE: readonly (readonly [number, number])[] = [
  [-4.0, 15],
  [-1.1, 5.0],
  [0.6, 2.3],
  [1.9, 1.7],
  [2.7, 1.45],
  [3.5, 1.25],
  [4.4, 1.05],
  [4.83, 1.0],
  [5.9, 0.88],
  [7.4, 0.69],
  [8.9, 0.57],
  [10.3, 0.44],
  [12.3, 0.21],
  [15.0, 0.1],
];

export function massFromAbsMag(absMag: number): number {
  const t = MAIN_SEQUENCE;
  if (absMag <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (absMag <= t[i][0]) {
      const f = (absMag - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
      return t[i - 1][1] + f * (t[i][1] - t[i - 1][1]);
    }
  }
  return t[t.length - 1][1];
}

/** 赤色巨星か（色が赤く、主系列としては明るすぎる） */
export const isGiant = (absMag: number, bv: number): boolean => bv >= 0.9 && absMag < 2.0;

/** 恒星の半径（太陽半径）。光度（放射補正は無視）と有効温度から R = √L / (T/T☉)² */
export function radiusFromStar(absMag: number, teffK: number): number {
  const lum = 10 ** (-0.4 * (absMag - 4.83));
  return Math.sqrt(lum) / (teffK / T_SUN) ** 2;
}

/** 恒星の色（0〜1 の RGB）。有効温度からのおおよその色（見た目のための近似） */
export function starColor(teffK: number): [number, number, number] {
  const t = Math.min(40_000, Math.max(2_000, teffK)) / 100;
  const r = t <= 66 ? 255 : 329.7 * (t - 60) ** -0.1332;
  const g = t <= 66 ? 99.47 * Math.log(t) - 161.1 : 288.1 * (t - 60) ** -0.0755;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5 * Math.log(t - 10) - 305.0;
  const c = (v: number) => Math.min(1, Math.max(0, v / 255));
  return [c(r), c(g), c(b)];
}

interface StarModel {
  massSun: number;
  radiusSun: number;
  teffK: number;
  giant: boolean;
}

function starModel(host: HostStar, real: RealSystem | null): StarModel {
  const teffK = real?.star.teffK ?? teffFromBv(host.bv);
  const giant = isGiant(host.absMag, host.bv);
  return {
    massSun: real?.star.massSun ?? (giant ? 1.2 : massFromAbsMag(host.absMag)),
    radiusSun: real?.star.radiusSun ?? radiusFromStar(host.absMag, teffK),
    teffK,
    giant,
  };
}

// ── 惑星の見た目 ────────────────────────────────────

const rgb = (hex: number): Rgb => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

/**
 * 惑星の種類と温度から、模様を決める（要件 F23。見た目のための決まり）。
 * 種類は半径で分ける：1.6 地球半径まで岩、6 地球半径まで氷（海王星型）、それより大きいとガス（木星型）
 */
export function planetLook(radiusEarth: number, tempK: number, rand: () => number): SurfaceLook {
  const pick = <T>(xs: readonly T[]) => xs[Math.min(xs.length - 1, Math.floor(rand() * xs.length))];
  if (radiusEarth > 6) {
    const colors =
      tempK > 1000
        ? pick([[rgb(0x3a1e18), rgb(0x6e3424), rgb(0xa8583a)], [rgb(0x2a2030), rgb(0x553a48), rgb(0x8a5a50)]])
        : tempK > 300
          ? pick([[rgb(0x8a5a3a), rgb(0xc8955e), rgb(0xe8c89a)], [rgb(0x9a7a5a), rgb(0xd0b08a), rgb(0xf0e0c0)]])
          : tempK > 150
            ? pick([[rgb(0x8c6a4a), rgb(0xd8b98c), rgb(0xeee0c8)], [rgb(0xb09060), rgb(0xe3cf9a), rgb(0xf4ead0)]])
            : pick([[rgb(0x5a8aa0), rgb(0x8cc8d2), rgb(0xc0e8ec)], [rgb(0x34509e), rgb(0x6a8ad8), rgb(0xa0b8f0)]]);
    return { kind: 'banded', colors, bands: 10 + Math.floor(rand() * 10), turbulence: 0.05 + rand() * 0.15 };
  }
  if (radiusEarth > 1.6) {
    const colors =
      tempK > 700
        ? [rgb(0xb09878), rgb(0xd8c4a0), rgb(0xf0e4c8)]
        : tempK > 250
          ? pick([[rgb(0x4a7a9a), rgb(0x7aaac8), rgb(0xb8d8e8)], [rgb(0x7a8a9a), rgb(0xa8b8c4), rgb(0xd8e0e8)]])
          : pick([[rgb(0x3a5aa8), rgb(0x5a80d0), rgb(0x9ab8f0)], [rgb(0x5aa0a8), rgb(0x8cc8d0), rgb(0xc8e8ec)]]);
    return { kind: 'banded', colors, bands: 4 + Math.floor(rand() * 6), turbulence: 0.1 + rand() * 0.3 };
  }
  const colors =
    tempK > 700
      ? pick([[rgb(0x1a1210), rgb(0x5a2a18), rgb(0xc85a20)], [rgb(0x2a2420), rgb(0x5a4a40), rgb(0x8a7a6a)]])
      : tempK > 350
        ? pick([[rgb(0x6a4a30), rgb(0xa8784a), rgb(0xd8b080)], [rgb(0x7a6a5a), rgb(0xb0a090), rgb(0xd8ccc0)]])
        : tempK > 200
          ? pick([[rgb(0x1a3a6a), rgb(0x3a6a4a), rgb(0xc8b890)], [rgb(0x7a3a22), rgb(0xc1623b), rgb(0xd8925e)], [rgb(0x5e5a55), rgb(0x8f8a84), rgb(0xb4aea6)]])
          : pick([[rgb(0x8a9aa8), rgb(0xc8d4dc), rgb(0xf4f8fa)], [rgb(0x6a6058), rgb(0xa8a098), rgb(0xe0dcd8)]]);
  return { kind: 'rocky', colors, craters: rand() * 0.45 };
}

// ── 軌道 ───────────────────────────────────────────

/**
 * 空の面の座標（実在の惑星の軌道の向きの基準）→ EQJ。
 * z：恒星から太陽（地球）への向き、x：空の北の向き、y＝z×x。
 * 軌道傾斜角 90 度・近点引数 ω のとき、真近点角 90°−ω で惑星が恒星の手前を通る（トランジット）
 */
export function skyFrame(starPc: Vec3): Mat3 {
  const z = normalize(scale(starPc, -1));
  const north = { x: -z.z * z.x, y: -z.z * z.y, z: 1 - z.z * z.z };
  const x = length(north) > 1e-9 ? normalize(north) : { x: 1, y: 0, z: 0 };
  const y = { x: z.y * x.z - z.z * x.y, y: z.z * x.x - z.x * x.z, z: z.x * x.y - z.y * x.x };
  return [x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z];
}

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Laplace の影響圏（km）。基準の天体にする範囲 */
const laplaceSoiKm = (aKm: number, massSun: number, starMassSun: number) => aKm * (massSun / starMassSun) ** 0.4;

/** 質量と半径の関係（Chen & Kipping 2017 の区分ごとのべき乗）。半径（地球半径）→ 質量（地球質量） */
export function massFromRadiusEarth(rEarth: number): number {
  if (rEarth < 1.23) return rEarth ** (1 / 0.279);
  if (rEarth < 11) return (rEarth / 0.808) ** (1 / 0.589);
  return 300; // 木星型は半径から質量が決まらないので、木星くらいとする
}

/** 質量（地球質量）→ 半径（地球半径）。Chen & Kipping 2017 */
export function radiusFromMassEarth(mEarth: number): number {
  if (mEarth < 2.04) return mEarth ** 0.279;
  if (mEarth < 132) return 0.808 * mEarth ** 0.589;
  return 17.74 * mEarth ** -0.044;
}

/** 惑星の平衡温度（K）。アルベド 0・熱が星全体に回る場合 T = T★ √(R★ / 2a) */
const equilibriumK = (star: StarModel, aKm: number) => star.teffK * Math.sqrt((star.radiusSun * R_SUN_KM) / (2 * aKm));

interface PlanetSpec {
  n: number;
  nameJa: string;
  radiusKm: number;
  massSun: number;
  elements: KeplerElements;
  look: SurfaceLook;
  seed: number;
  spin: Spin;
}

function spinFor(periodDays: number, pole: Vec3, rand: () => number): Spin {
  // 恒星のすぐそば（10 日より短い周期）は、恒星に同じ面を向ける
  if (periodDays < 10) return { type: 'locked' };
  return { type: 'steady', pole, periodHours: 8 + rand() * 32, phaseRad: rand() * 2 * Math.PI };
}

const charSeed = (s: string) => hashInts(...Array.from(s, (c) => c.charCodeAt(0)));

function realPlanets(sys: RealSystem, host: HostStar, star: StarModel): PlanetSpec[] {
  const frame = skyFrame(host.positionPc);
  return sys.planets.map((p: RealPlanet, k) => {
    const n = k + 1;
    const seed = hashInts(charSeed(sys.code), n, 7);
    const rand = mulberry32(seed);
    const e = Math.min(0.95, Math.max(0, p.e ?? 0));
    // 分からない向きは種から決める（傾斜角は向きがでたらめになるように cos i を一様に）
    const iRad = (p.iDeg ?? (Math.acos(2 * rand() - 1) / DEG)) * DEG;
    const nodeRad = (p.nodeDeg ?? rand() * 360) * DEG;
    const periRad = (p.periDeg ?? rand() * 360) * DEG;
    let meanAnomalyRad = rand() * 2 * Math.PI;
    let epochMs = J2000_MS;
    if (p.transitJd !== null) {
      // トランジットの時刻が分かれば、そのとき恒星の手前（真近点角 90°−ω）にいるように合わせる
      meanAnomalyRad = meanAnomalyFromTrue(Math.PI / 2 - periRad, e);
      epochMs = (p.transitJd - JD_UNIX_EPOCH) * 86_400_000;
    }
    const aKm = p.aAu * KM_PER_AU;
    const tempK = p.temperatureK ?? equilibriumK(star, aKm);
    const massEarth = p.massMj !== null ? (p.massMj * M_JUPITER_SUN) / M_EARTH_SUN : null;
    const radiusEarth =
      p.radiusRj !== null ? (p.radiusRj * R_JUPITER_KM) / R_EARTH_KM : massEarth !== null ? radiusFromMassEarth(massEarth) : 1 + rand() * 3;
    const massSun = massEarth !== null ? massEarth * M_EARTH_SUN : massFromRadiusEarth(radiusEarth) * M_EARTH_SUN;
    const elements: KeplerElements = {
      aKm,
      e,
      iRad,
      nodeRad,
      periRad,
      meanAnomalyRad,
      epochMs,
      periodDays: p.periodDays,
      frame,
    };
    return {
      n,
      nameJa: p.name,
      radiusKm: radiusEarth * R_EARTH_KM,
      massSun,
      elements,
      look: planetLook(radiusEarth, tempK, rand),
      seed,
      spin: spinFor(p.periodDays, { x: 0, y: 0, z: 1 }, rand),
    };
  });
}

/** 恒星の種類ごとの、惑星を持つ割合と、木星型の惑星を持つ割合（docs/tech/exoplanets.md の出典） */
const OCCURRENCE = {
  M: { hasPlanets: 0.85, giant: 0.03 },
  FGK: { hasPlanets: 0.75, giant: 0.1 },
  AB: { hasPlanets: 0.35, giant: 0.2 },
  giant: { hasPlanets: 0.15, giant: 0.1 },
} as const;
/** 惑星の数（1〜8 個）の割合 */
const MULTIPLICITY = [0.3, 0.22, 0.17, 0.12, 0.09, 0.06, 0.03, 0.01];

function starClass(star: StarModel): keyof typeof OCCURRENCE {
  if (star.giant) return 'giant';
  if (star.massSun < 0.6) return 'M';
  if (star.massSun < 1.4) return 'FGK';
  return 'AB';
}

/** 自動で作る惑星（世代 1）。数は乱数との大小の比べだけで決める（端末による計算の差で数が変わらないように） */
function generatedPlanetsV1(host: HostStar, star: StarModel): PlanetSpec[] {
  const rand = mulberry32(hashInts(charSeed(host.system), 0x504c414e, 1));
  const occ = OCCURRENCE[starClass(star)];
  if (rand() >= occ.hasPlanets) return [];
  let count = MULTIPLICITY.length;
  let u = rand();
  for (let k = 0; k < MULTIPLICITY.length; k++) {
    if (u < MULTIPLICITY[k]) {
      count = k + 1;
      break;
    }
    u -= MULTIPLICITY[k];
  }
  // 惑星の並ぶ面（ほぼ同じ面に並ぶ。向きはでたらめ）
  const planeI = Math.acos(2 * rand() - 1);
  const planeNode = rand() * 2 * Math.PI;
  const minAKm = 3 * star.radiusSun * R_SUN_KM;
  let periodDays = 1.5 * (40 / 1.5) ** rand();
  const out: PlanetSpec[] = [];
  for (let k = 0; k < count; k++) {
    if (k > 0) periodDays *= 1.4 + 1.6 * rand();
    const giant = (periodDays > 200 && rand() < occ.giant) || (k === 0 && periodDays < 10 && rand() < 0.01);
    let radiusEarth: number;
    if (giant) radiusEarth = ((0.8 + 0.5 * rand()) * R_JUPITER_KM) / R_EARTH_KM;
    else if (periodDays < 100) radiusEarth = rand() < 0.55 ? 0.8 + 0.9 * rand() : 1.8 + 1.7 * rand();
    else radiusEarth = rand() < 0.6 ? 1 + rand() : 2 + 4 * rand();
    const massEarth = giant ? ((0.3 + 2.7 * rand()) * M_JUPITER_SUN) / M_EARTH_SUN : massFromRadiusEarth(radiusEarth);
    const aKm = axisKmFromPeriod(periodDays, star.massSun);
    const e = giant ? 0.3 * rand() : 0.08 * rand();
    const iRad = planeI + (rand() - 0.5) * 4 * DEG;
    const nodeRad = planeNode + (rand() - 0.5) * 4 * DEG;
    const periRad = rand() * 2 * Math.PI;
    const meanAnomalyRad = rand() * 2 * Math.PI;
    const lookRand = mulberry32(hashInts(charSeed(host.system), k, 0x4c4f4f4b));
    const spinRand = mulberry32(hashInts(charSeed(host.system), k, 0x5350494e));
    // 恒星に近すぎる（恒星の中に入る）惑星は作らない
    if (aKm < minAKm) continue;
    out.push({
      n: 0,
      nameJa: '',
      radiusKm: radiusEarth * R_EARTH_KM,
      massSun: massEarth * M_EARTH_SUN,
      elements: { aKm, e, iRad, nodeRad, periRad, meanAnomalyRad, epochMs: J2000_MS, periodDays, frame: IDENTITY },
      look: planetLook(radiusEarth, equilibriumK(star, aKm), lookRand),
      seed: hashInts(charSeed(host.system), k, 0x53454544),
      spin: spinFor(periodDays, { x: 0, y: 0, z: 1 }, spinRand),
    });
  }
  return out.map((p, i) => ({ ...p, n: i + 1, nameJa: `第${i + 1}惑星` }));
}

/** 恒星の天体の id（住所には使わない。基準の天体にもしない） */
export const starBodyId = (system: string): string => `${system}.0`;

/**
 * 恒星系の天体（恒星と惑星）。real は実在の惑星のデータ（無ければ自動で作る）。
 * 惑星の id は src/world/address.ts の exoplanetId（住所の番号を含む）
 */
export function systemBodies(host: HostStar, real: RealSystem | null): BodyInfo[] {
  const star = starModel(host, real);
  const starId = starBodyId(host.system);
  const positionKm = scale(host.positionPc, KM_PER_PC);
  const bodies: BodyInfo[] = [
    {
      id: starId,
      nameJa: real ? real.name : `恒星 ${host.system}`,
      radiusKm: star.radiusSun * R_SUN_KM,
      kind: 'star',
      parent: null,
      motion: { type: 'fixed', positionKm },
      spin: { type: 'steady', pole: { x: 0, y: 0, z: 1 }, periodHours: 600, phaseRad: 0 },
      glow: starColor(star.teffK),
    },
  ];
  const generation = real ? 1 : PLANET_GENERATION;
  const planets = real ? realPlanets(real, host, star) : generatedPlanetsV1(host, star);
  for (const p of planets) {
    bodies.push({
      id: exoplanetId(host.system, p.n, generation),
      nameJa: p.nameJa,
      radiusKm: p.radiusKm,
      kind: 'exoplanet',
      parent: starId,
      motion: { type: 'kepler', parent: starId, elements: p.elements },
      spin: p.spin,
      anchorRadiusKm: Math.max(p.radiusKm * 3, laplaceSoiKm(p.elements.aKm, p.massSun, star.massSun)),
      surface: { look: p.look, seed: p.seed },
    });
  }
  return bodies;
}
