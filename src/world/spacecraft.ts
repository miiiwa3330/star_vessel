/**
 * 太陽系を飛んでいる探査機（要件 F42）。データは public/data/spacecraft.json（tools/build-spacecraft.mjs が JPL Horizons から作る）。
 * 位置と速さの表をエルミート補間でつなぐ。表の期間の外では、いちばん近い端の速さのまま進める。決まりは docs/tech/spacecraft.md。
 * three.js・DOM を読み込まない。
 */
import type { BodyInfo } from './solar-system';
import type { Vec3 } from './vec';

export interface SpacecraftRecord {
  /** V＋JPL の番号の絶対値（例：ボイジャー1号は V31） */
  id: string;
  nameJa: string;
  sizeM: number;
  /** 表の最初の時刻（UNIX 日） */
  startDays: number;
  stepDays: number;
  /** x・y・z（km）、vx・vy・vz（km/s）の 6 個ずつ。太陽中心の ICRF（EQJ と同じ向きとして扱う） */
  pv: number[];
}

const DAY_MS = 86_400_000;
const DAY_S = 86_400;

/** 表から位置（太陽中心・EQJ・km）を出す */
export function spacecraftPositionKm(s: SpacecraftRecord, date: Date): Vec3 {
  const n = s.pv.length / 6;
  const t = (date.getTime() / DAY_MS - s.startDays) / s.stepDays;
  const row = (i: number, k: number) => s.pv[i * 6 + k];
  if (t <= 0 || t >= n - 1 || n < 2) {
    const i = t <= 0 ? 0 : n - 1;
    const dt = (t - i) * s.stepDays * DAY_S;
    return { x: row(i, 0) + row(i, 3) * dt, y: row(i, 1) + row(i, 4) * dt, z: row(i, 2) + row(i, 5) * dt };
  }
  const i = Math.floor(t);
  const u = t - i;
  const h = s.stepDays * DAY_S;
  const h00 = (1 + 2 * u) * (1 - u) * (1 - u);
  const h10 = u * (1 - u) * (1 - u);
  const h01 = u * u * (3 - 2 * u);
  const h11 = u * u * (u - 1);
  const v = (k: number) => h00 * row(i, k) + h10 * h * row(i, k + 3) + h01 * row(i + 1, k) + h11 * h * row(i + 1, k + 3);
  return { x: v(0), y: v(1), z: v(2) };
}

/** 探査機の英語の名前（左上の表示。データには日本語の名前しか無いので、ここに持つ。無ければ日本語の名前） */
const SPACECRAFT_NAMES: Readonly<Record<string, string>> = {
  V31: 'Voyager 1',
  V32: 'Voyager 2',
  V23: 'Pioneer 10',
  V24: 'Pioneer 11',
  V98: 'New Horizons',
  V170: 'James Webb Space Telescope',
  V680: 'Euclid',
  V139479: 'Gaia',
  V96: 'Parker Solar Probe',
  V144: 'Solar Orbiter',
  V49: 'Lucy',
  V255: 'Psyche',
  V159: 'Europa Clipper',
  V28: 'JUICE',
  V121: 'BepiColombo',
  V91: 'Hera',
  V64: 'OSIRIS-APEX',
  V37: 'Hayabusa2',
};

export function spacecraftBody(s: SpacecraftRecord): BodyInfo {
  const radiusKm = s.sizeM / 2 / 1000;
  return {
    id: s.id,
    name: SPACECRAFT_NAMES[s.id] ?? s.nameJa,
    nameJa: s.nameJa,
    radiusKm,
    kind: 'spacecraft',
    parent: 'Sun',
    motion: { type: 'custom', parent: 'Sun', relativeKm: (date) => spacecraftPositionKm(s, date) },
    spin: { type: 'steady', pole: { x: 0, y: 0, z: 1 }, periodHours: 24, phaseRad: 0 },
    // そばに止まっていられるように（秒速数十 km で動いている）
    anchorRadiusKm: 20,
  };
}
