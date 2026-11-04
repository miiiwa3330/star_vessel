/**
 * 星団（散開星団・球状星団）。位置・大きさ・メンバーの数は Hunt & Reffert (2023) の表（public/data/clusters.json。tools/build-clusters.mjs）。
 * メンバーの星は、近づいたときに星団ごとの種から作る（誰が見ても同じ）。決まりと出典は docs/tech/clusters.md。
 * three.js・DOM・astronomy-engine を読み込まない。
 */
import { sampleStarType } from './galaxy';
import { hashInts, mulberry32 } from './random';
import type { Vec3 } from './vec';

export interface Cluster {
  name: string;
  nameJa: string | null;
  kind: 'open' | 'globular';
  /** 太陽中心の EQJ（pc） */
  positionPc: Vec3;
  /** 半数のメンバーが入る半径（pc） */
  r50Pc: number;
  /** 潮汐半径（pc。分からなければ null） */
  rtPc: number | null;
  /** Gaia で見つかったメンバーの数 */
  members: number;
}

type Raw = [string, string | null, 'o' | 'g', number, number, number, number, number | null, number, number | null];

export function decodeClusters(json: { clusters: Raw[] }): Cluster[] {
  return json.clusters.map((c) => ({
    name: c[0],
    nameJa: c[1],
    kind: c[2] === 'g' ? 'globular' : 'open',
    positionPc: { x: c[3], y: c[4], z: c[5] },
    r50Pc: c[6],
    rtPc: c[7],
    members: c[8],
  }));
}

/** 表示する名前（日本語の名前があればそれ） */
export const clusterLabel = (c: Cluster): string => c.nameJa ?? c.name;

/** 星団全体をまとめた明るさ（絶対等級）。メンバー 1 個を太陽より少し明るい 4 等とし、数の分だけ明るくする（見た目のための近似） */
export const clusterAbsMag = (c: Cluster): number => 4 - 2.5 * Math.log10(Math.max(1, c.members));

/** 作るメンバーの数の上限（散開・球状）。重さのため */
export const MAX_MEMBERS = { open: 1_500, globular: 4_000 } as const;
/** 本物の星のデータ（HYG）が揃っている見かけの等級。これより明るいメンバーは HYG に入っているので作らない */
const HYG_COMPLETE_MAG = 9;
/** 本物の星のデータがある範囲（pc）。src/world/galaxy.ts の REAL_DATA_RADIUS_PC と同じ考え方 */
const REAL_DATA_RADIUS_PC = 1000;

export interface ClusterStar {
  position: Vec3;
  absMag: number;
  bv: number;
}

const nameSeed = (s: string) => hashInts(...Array.from(s, (ch) => ch.charCodeAt(0)));

/**
 * 星団のメンバーの星を作る。数は Gaia のメンバーの数（上限あり）、配置はプラマーの分布（半数半径 r50）。
 * 本物の星のデータの範囲（1,000 pc 以内）では、HYG に入っている明るさの星は作らない（同じ星が 2 つにならないように）
 */
export function clusterStars(c: Cluster): ClusterStar[] {
  const rand = mulberry32(hashInts(nameSeed(c.name), 0x434c5553));
  const count = Math.min(c.members, MAX_MEMBERS[c.kind]);
  const distPc = Math.hypot(c.positionPc.x, c.positionPc.y, c.positionPc.z);
  // HYG に入っている星の絶対等級の上限（これより明るい星は作らない）
  const brightLimit = distPc < REAL_DATA_RADIUS_PC ? HYG_COMPLETE_MAG - 5 * Math.log10(distPc / 10) : -Infinity;
  // プラマーの分布：半数半径 r50 ≈ 1.305 a
  const a = c.r50Pc / 1.305;
  const rMax = c.rtPc ?? c.r50Pc * 5;
  const out: ClusterStar[] = [];
  for (let k = 0; k < count; k++) {
    const u = Math.max(1e-6, rand());
    const r = Math.min(rMax, a / Math.sqrt(u ** (-2 / 3) - 1));
    const cosT = 2 * rand() - 1;
    const sinT = Math.sqrt(1 - cosT * cosT);
    const phi = rand() * 2 * Math.PI;
    const star = sampleStarType(rand);
    if (star.absMag < brightLimit) continue;
    out.push({
      position: {
        x: c.positionPc.x + r * sinT * Math.cos(phi),
        y: c.positionPc.y + r * sinT * Math.sin(phi),
        z: c.positionPc.z + r * cosT,
      },
      absMag: star.absMag,
      bv: star.bv,
    });
  }
  return out;
}

/** cameraPc（太陽中心の EQJ・pc）から近い星団を、近い順に最大 max 個。within は星団ごとの「近い」の範囲（pc） */
export function nearbyClusters(clusters: readonly Cluster[], cameraPc: Vec3, max: number): Cluster[] {
  return clusters
    .map((c) => ({
      c,
      d: Math.hypot(c.positionPc.x - cameraPc.x, c.positionPc.y - cameraPc.y, c.positionPc.z - cameraPc.z),
    }))
    .filter((e) => e.d < Math.max(50, e.c.r50Pc * 30))
    .sort((x, y) => x.d - y.d)
    .slice(0, max)
    .map((e) => e.c);
}

/** cameraPc がどの星団の中にいるか（半数半径の 3 倍以内。いちばん近いもの）。いなければ null */
export function clusterAt(clusters: readonly Cluster[], cameraPc: Vec3): Cluster | null {
  let best: Cluster | null = null;
  let bestD = Infinity;
  for (const c of clusters) {
    const d = Math.hypot(c.positionPc.x - cameraPc.x, c.positionPc.y - cameraPc.y, c.positionPc.z - cameraPc.z);
    if (d < c.r50Pc * 3 && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}
