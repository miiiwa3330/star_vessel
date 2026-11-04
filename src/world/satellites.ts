/**
 * 地球のまわりの人工衛星（ISS など）。軌道要素（TLE）から、SGP4（satellite.js）で位置を出す。
 * satellite.js はこのファイルの中だけで使う（AGENTS.md：計算ライブラリは自分たちの関数で包む）。決まりは docs/tech/satellites.md。
 *
 * - 衛星は約 1,700 機あり、毎フレームすべてを SGP4 で計算すると重い。毎フレーム一部（ROLL_FRACTION）だけ計算し直し、
 *   残りは最後に計算した速度で位置を進める（光の点として描くには十分）
 * - 近くの数機だけを天体の一覧に入れ（smallSatelliteBody）、模型・住所・近づける距離の制限を付ける。こちらは毎回 SGP4 で計算する
 */
import { propagate, twoline2satrec, type SatRec } from 'satellite.js';
import { eqdToEqj, type BodyInfo } from './solar-system';
import { mulVec, type Mat3, type Vec3 } from './vec';
import type { SatelliteRecord } from './satellite-data';

export type { SatelliteRecord } from './satellite-data';

/** 1 フレームで SGP4 を計算し直す割合（残りは速度で進める） */
const ROLL_FRACTION = 1 / 30;
/** 大きさ（km）。見た目のための値（ISS は太陽電池の翼の幅 約 109 m、中国の宇宙ステーションは約 55 m、ほかは 10 m とした） */
export function satelliteSizeKm(name: string): number {
  if (/ISS \(ZARYA\)/.test(name)) return 0.109;
  if (/^CSS \(TIANHE/.test(name)) return 0.055;
  return 0.01;
}

/** TEME（SGP4 の座標）→ EQJ の回転。1 分ごとに作り直す（歳差・章動はゆっくりなので） */
let rotMinute = Number.NaN;
let rot: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
function temeToEqj(date: Date): Mat3 {
  const minute = Math.floor(date.getTime() / 60_000);
  if (minute !== rotMinute) {
    rot = eqdToEqj(date);
    rotMinute = minute;
  }
  return rot;
}

/** 地球の中心からの位置（km・EQJ）。計算できない（軌道が壊れた・古すぎる）ときは null */
export function satellitePositionKm(satrec: SatRec, date: Date): { p: Vec3; v: Vec3 } | null {
  const r = propagate(satrec, date);
  if (!r || !r.position || typeof r.position === 'boolean' || !r.velocity || typeof r.velocity === 'boolean') return null;
  const m = temeToEqj(date);
  return { p: mulVec(m, r.position), v: mulVec(m, r.velocity) };
}

export class SatelliteCatalog {
  readonly records: SatelliteRecord[] = [];
  readonly satrecs: SatRec[] = [];
  /** 地球の中心からの位置（km・EQJ）と速度（km/s）。光の点に使う。xyz を 3 個ずつ */
  readonly positions: Float64Array;
  private readonly velocities: Float64Array;
  private readonly at: Float64Array;
  private readonly ok: Uint8Array;
  private next = 0;

  constructor(records: readonly SatelliteRecord[]) {
    for (const r of records) {
      // 宇宙ステーションに結合している部品は外す（古い写しにも効くように、ここでも確かめる）
      if (/^(ISS|CSS) \((?!ZARYA|TIANHE)/.test(r.name)) continue;
      try {
        const s = twoline2satrec(r.l1, r.l2);
        if (s.error) continue;
        this.records.push(r);
        this.satrecs.push(s);
      } catch {
        // 読めない TLE は使わない
      }
    }
    const n = this.records.length;
    this.positions = new Float64Array(n * 3);
    this.velocities = new Float64Array(n * 3);
    this.at = new Float64Array(n).fill(Number.NaN);
    this.ok = new Uint8Array(n);
  }

  get count(): number {
    return this.records.length;
  }

  /** i 番目の衛星が計算できているか（壊れた軌道は描かない） */
  isOk(i: number): boolean {
    return this.ok[i] === 1;
  }

  private recompute(i: number, date: Date): void {
    const r = satellitePositionKm(this.satrecs[i], date);
    if (!r) {
      this.ok[i] = 0;
      return;
    }
    this.ok[i] = 1;
    this.positions.set([r.p.x, r.p.y, r.p.z], i * 3);
    this.velocities.set([r.v.x, r.v.y, r.v.z], i * 3);
    this.at[i] = date.getTime();
  }

  /** 位置を date に進める。一部は SGP4 で計算し直し、ほかは速度で進める。first なら全部計算する */
  update(date: Date, first = false): void {
    const n = this.count;
    if (n === 0) return;
    const step = first ? n : Math.max(1, Math.ceil(n * ROLL_FRACTION));
    for (let k = 0; k < step; k++) {
      this.recompute(this.next, date);
      this.next = (this.next + 1) % n;
    }
    const t = date.getTime();
    for (let i = 0; i < n; i++) {
      if (!this.ok[i]) continue;
      const dt = (t - this.at[i]) / 1000;
      if (dt === 0) continue;
      const o = i * 3;
      this.positions[o] += this.velocities[o] * dt;
      this.positions[o + 1] += this.velocities[o + 1] * dt;
      this.positions[o + 2] += this.velocities[o + 2] * dt;
      this.at[i] = t;
    }
  }

  /** 地球の中心から見た位置 fromKm（km・EQJ）から withinKm 以内の衛星の番号（並びの添字）を、近い順に最大 max 個 */
  nearby(fromKm: Vec3, withinKm: number, max: number): number[] {
    const out: { i: number; d: number }[] = [];
    for (let i = 0; i < this.count; i++) {
      if (!this.ok[i]) continue;
      const o = i * 3;
      const d = Math.hypot(this.positions[o] - fromKm.x, this.positions[o + 1] - fromKm.y, this.positions[o + 2] - fromKm.z);
      if (d <= withinKm) out.push({ i, d });
    }
    return out
      .sort((a, b) => a.d - b.d)
      .slice(0, max)
      .map((e) => e.i);
  }

  indexOfId(id: number): number {
    return this.records.findIndex((r) => r.id === id);
  }

  /** i 番目の衛星を天体の一覧の形にする（近くに来たとき。毎回 SGP4 で正確に計算する） */
  body(i: number): BodyInfo {
    const r = this.records[i];
    const satrec = this.satrecs[i];
    const sizeKm = satelliteSizeKm(r.name);
    let last: Vec3 = { x: this.positions[i * 3], y: this.positions[i * 3 + 1], z: this.positions[i * 3 + 2] };
    return {
      id: `N${r.id}`,
      nameJa: satelliteNameJa(r.name),
      radiusKm: sizeKm / 2,
      kind: 'satellite',
      parent: 'Earth',
      motion: {
        type: 'custom',
        parent: 'Earth',
        relativeKm: (date) => {
          const s = satellitePositionKm(satrec, date);
          if (s) last = s.p;
          return last;
        },
      },
      spin: { type: 'locked' },
      // 秒速 7〜8 km で動くので、そばに止まっていられるよう、少し広めに基準にする
      anchorRadiusKm: 20,
    };
  }
}

/** よく知られた衛星の日本語の名前（ほかは TLE の名前のまま） */
export function satelliteNameJa(name: string): string {
  if (/^ISS \(ZARYA\)/.test(name)) return '国際宇宙ステーション（ISS）';
  if (/^CSS \(TIANHE/.test(name)) return "中国宇宙ステーション（天宮）";
  return name;
}
