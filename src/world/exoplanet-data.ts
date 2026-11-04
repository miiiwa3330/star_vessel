/**
 * 実在の系外惑星のデータ（public/data/exoplanets.json）の読み方。
 * データは tools/build-exoplanets.mjs が Open Exoplanet Catalogue（MIT）から作る。形式は docs/tech/exoplanets.md。
 */
import type { Vec3 } from './vec';

export interface RealPlanet {
  name: string;
  /** 軌道長半径（AU） */
  aAu: number;
  periodDays: number;
  e: number | null;
  /** 軌道傾斜角（度。空の面に対して。90 度で真横から見る＝トランジットする） */
  iDeg: number | null;
  /** 昇交点の経度（度） */
  nodeDeg: number | null;
  /** 近点引数（度） */
  periDeg: number | null;
  /** トランジットの中心の時刻（ユリウス日） */
  transitJd: number | null;
  /** 半径（木星の半径を 1） */
  radiusRj: number | null;
  /** 質量（木星の質量を 1） */
  massMj: number | null;
  /** 温度（K） */
  temperatureK: number | null;
}

export interface RealSystem {
  /** 恒星系の記号（H＋HYG の id、または E＋名前のハッシュ） */
  code: string;
  name: string;
  /** HYG に無い恒星（E…）だけ：太陽中心の EQJ（pc）・絶対等級・色指数 */
  positionPc?: Vec3;
  absMag?: number;
  bv?: number;
  star: { massSun: number | null; radiusSun: number | null; teffK: number | null };
  /** 恒星に近い順 */
  planets: RealPlanet[];
}

type RawPlanet = [string, number, number, ...(number | null)[]];
interface RawSystem {
  code: string;
  name: string;
  pos?: [number, number, number];
  absMag?: number;
  bv?: number;
  star: { mass: number | null; radius: number | null; teff: number | null };
  planets: RawPlanet[];
}

export function decodeExoplanets(json: { systems: RawSystem[] }): Map<string, RealSystem> {
  const out = new Map<string, RealSystem>();
  for (const s of json.systems) {
    out.set(s.code, {
      code: s.code,
      name: s.name,
      positionPc: s.pos ? { x: s.pos[0], y: s.pos[1], z: s.pos[2] } : undefined,
      absMag: s.absMag,
      bv: s.bv,
      star: { massSun: s.star.mass, radiusSun: s.star.radius, teffK: s.star.teff },
      planets: s.planets.map((p) => ({
        name: p[0],
        aAu: p[1],
        periodDays: p[2],
        e: p[3] ?? null,
        iDeg: p[4] ?? null,
        nodeDeg: p[5] ?? null,
        periDeg: p[6] ?? null,
        transitJd: p[7] ?? null,
        radiusRj: p[8] ?? null,
        massMj: p[9] ?? null,
        temperatureK: p[10] ?? null,
      })),
    });
  }
  return out;
}
