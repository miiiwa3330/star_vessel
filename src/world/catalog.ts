/**
 * コレクション（図鑑）のカタログ：集められる天体の一覧と、その番号（要件 F38。2026-11-12 にオーナーと決めた）。
 * three.js・DOM・astronomy-engine を読み込まない純粋な計算。どの天体を入れるか（種）は src/ui/collection-catalog.ts が作る。
 *
 * - 入れるのは**名前のある実在の天体**（自動で作った星は無限にあるので入れない）。決まりは docs/tech/collection.md
 * - 番号は**全部を通しの 1 本**（No.00001 から）。誰の端末でも、同じデータなら同じ番号になる
 * - 並べ方：先に太陽系（order の小さい順。太陽 → 惑星とその衛星 → 冥王星 → 小惑星・準惑星 → 彗星 → 探査機）、
 *   そのあとに太陽系の外を、太陽から近い順（恒星のすぐ後ろに、その恒星の惑星）
 */
import type { InfoKind } from './info';

export interface CatalogSeed<T = unknown> {
  /** 訪れた記録と同じ記号（InfoTarget の key） */
  key: string;
  kind: InfoKind;
  /** 日本語の名前（無ければ英語の名前） */
  name: string;
  /** 英語の名前（日本語の名前と同じなら null） */
  nameEn: string | null;
  /** 太陽系の中の並び順（小さい順）。太陽系の外のものは undefined */
  order?: number;
  /** 太陽系の外：太陽からの距離（pc） */
  distancePc?: number;
  /** このすぐ後ろに並べるもの（恒星の惑星など） */
  children?: CatalogSeed<T>[];
  /** 詳細を作るための元のデータ */
  data: T;
}

export interface CatalogEntry<T = unknown> {
  /** 通しの番号（1 から） */
  no: number;
  key: string;
  kind: InfoKind;
  name: string;
  nameEn: string | null;
  /** 親（恒星の惑星なら、その恒星の記号） */
  parentKey: string | null;
  data: T;
}

/** 種から番号付きのカタログを作る。同じ記号が 2 度出てきたら、先のものだけを残す */
export function buildCatalog<T>(seeds: readonly CatalogSeed<T>[]): CatalogEntry<T>[] {
  const sol = seeds.filter((s) => s.order !== undefined).sort((a, b) => a.order! - b.order! || cmp(a.key, b.key));
  const deep = seeds
    .filter((s) => s.order === undefined)
    .sort((a, b) => (a.distancePc ?? Infinity) - (b.distancePc ?? Infinity) || cmp(a.key, b.key));
  const out: CatalogEntry<T>[] = [];
  const seen = new Set<string>();
  const push = (s: CatalogSeed<T>, parentKey: string | null) => {
    if (seen.has(s.key)) return;
    seen.add(s.key);
    out.push({ no: out.length + 1, key: s.key, kind: s.kind, name: s.name, nameEn: s.nameEn, parentKey, data: s.data });
    for (const c of s.children ?? []) push(c, s.key);
  };
  for (const s of [...sol, ...deep]) push(s, null);
  return out;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** 番号の書き方（5 桁。例：No.00042） */
export const formatCatalogNo = (no: number): string => `No.${String(no).padStart(5, '0')}`;

/**
 * 太陽系の並び順の値（小さい順に並べる）。planet は惑星の番号（1 水星〜8 海王星、9 冥王星）、moon は衛星の番号（0 は惑星そのもの）。
 * 衛星は 1,000 個より少ない（土星でも 274 個。NASA Planetary Fact Sheet 2025）
 */
export const solOrder = {
  sun: 0,
  planet: (planet: number, moon = 0) => planet * 1000 + moon,
  /** 小惑星・準惑星：軌道長半径（天文単位）の順 */
  smallBody: (aAu: number) => 10_000 + Math.min(aAu, 9_999),
  comet: (rank: number) => 20_000 + rank,
  spacecraft: (rank: number) => 30_000 + rank,
} as const;

/** 太陽系の中か（太陽系の並びの値を持つか） */
export const isSolSeed = (s: CatalogSeed): boolean => s.order !== undefined;

/** 種類ごとの、集めた数と全体の数 */
export function countByKind(entries: readonly { key: string; kind: InfoKind }[], visited: ReadonlySet<string>): Map<InfoKind, { got: number; total: number }> {
  const out = new Map<InfoKind, { got: number; total: number }>();
  for (const e of entries) {
    const c = out.get(e.kind) ?? { got: 0, total: 0 };
    c.total++;
    if (visited.has(e.key)) c.got++;
    out.set(e.kind, c);
  }
  return out;
}
