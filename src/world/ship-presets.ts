/**
 * 最初から選べる 3 つの UFO（ソーサー・ベル・リング）を、自分で作る船と同じ決まりのブロックで組む（要件 F27。2026-11-21 にオーナーの指示）。
 * three.js を読み込まない純粋な関数（テストは ship-presets.test.ts）。形と色は見た目のための仮のもの。
 *
 * 形は「中にあるか」の関数で書き、その中をブロックで埋める。外から見えない中のブロックは置かない（数を減らすため）。
 * 座標は作れる範囲（40 m の箱）の真ん中を原点にした m。+Y が上、−Z が前。
 */
import { CELL_M, GRID, blockCells, cellIndex, type Block, type BlockSize } from './ship-blocks';
import type { HullType } from './ship-design';

type Pred = (x: number, y: number, z: number) => boolean;
type ColorFn = (x: number, y: number, z: number) => number;

/** 色の番号（PALETTE の並び） */
const C = {
  white: 0,
  silver: 1,
  gray: 2,
  iron: 3,
  orange: 6,
  yellow: 7,
  teal: 10,
  water: 11,
  blue: 12,
  purple: 14,
  beige: 17,
  glowWhite: 18,
  glowCyan: 19,
  glowGreen: 20,
  glowYellow: 21,
  glowRed: 22,
} as const;
const LIGHTS = [C.glowGreen, C.glowYellow, C.glowRed, C.glowCyan];

class Assembler {
  private readonly occ = new Uint8Array(GRID * GRID * GRID);
  readonly blocks: Block[] = [];

  private free(b: Block): boolean {
    const n = blockCells(b);
    if ([b.x, b.y, b.z].some((v) => v < 0 || v + n > GRID)) return false;
    for (let y = b.y; y < b.y + n; y++)
      for (let z = b.z; z < b.z + n; z++) for (let x = b.x; x < b.x + n; x++) if (this.occ[cellIndex(x, y, z)]) return false;
    return true;
  }

  private add(b: Block): boolean {
    if (!this.free(b)) return false;
    const n = blockCells(b);
    for (let y = b.y; y < b.y + n; y++)
      for (let z = b.z; z < b.z + n; z++) for (let x = b.x; x < b.x + n; x++) this.occ[cellIndex(x, y, z)] = 1;
    this.blocks.push(b);
    return true;
  }

  /** 大きさ s のブロックで、inside の中を埋める（ブロックの格子は、その大きさでそろえる）。外から見えないものは置かない */
  fill(s: BlockSize, inside: Pred, color: ColorFn): void {
    const n = blockCells({ s });
    const step = n * CELL_M;
    for (let y = 0; y + n <= GRID; y += n)
      for (let z = 0; z + n <= GRID; z += n)
        for (let x = 0; x + n <= GRID; x += n) {
          const cx = (x + n / 2 - GRID / 2) * CELL_M;
          const cy = (y + n / 2 - GRID / 2) * CELL_M;
          const cz = (z + n / 2 - GRID / 2) * CELL_M;
          if (!inside(cx, cy, cz)) continue;
          const hidden =
            inside(cx + step, cy, cz) &&
            inside(cx - step, cy, cz) &&
            inside(cx, cy + step, cz) &&
            inside(cx, cy - step, cz) &&
            inside(cx, cy, cz + step) &&
            inside(cx, cy, cz - step);
          if (hidden) continue;
          this.add({ x, y, z, s, c: color(cx, cy, cz) });
        }
  }

  /** 真ん中が (x, y, z) m あたりに、大きさ s のブロックを 1 つ置く（重なるなら置かない） */
  put(s: BlockSize, x: number, y: number, z: number, c: number): void {
    const n = blockCells({ s });
    const cell = (m: number) => Math.round(m / CELL_M + GRID / 2 - n / 2);
    this.add({ x: cell(x), y: cell(y), z: cell(z), s, c });
  }

  /** 半径 r・高さ y に、count 個の光を輪に並べる。front：前（−Z）にも白い光を置くか */
  ring(r: number, y: number, count: number, front: boolean): void {
    if (front) this.put(0, 0, y, -r, C.glowWhite);
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + Math.PI / count;
      this.put(0, Math.sin(a) * r, y, -Math.cos(a) * r, LIGHTS[k % LIGHTS.length]);
    }
  }
}

const rOf = (x: number, z: number) => Math.hypot(x, z);

/** 平たい円盤に小さなドーム（直径 30 m） */
function saucer(): Block[] {
  const a = new Assembler();
  const R = 15;
  const inDome: Pred = (x, y, z) => y >= 1 && Math.hypot(x, (y - 1) / 0.8, z) <= 4.6;
  a.fill(0, inDome, () => C.water);
  const q = (x: number, z: number) => (rOf(x, z) / R) ** 2;
  const upper: Pred = (x, y, z) => rOf(x, z) <= R && y > 0 && y <= 0.4 + 2.6 * (1 - q(x, z)) && !inDome(x, y, z);
  a.fill(1, upper, (x, _y, z) => (Math.abs(rOf(x, z) - 10) < 0.8 ? C.blue : C.silver));
  const lower: Pred = (x, y, z) => rOf(x, z) <= R - 0.5 && y < 0 && -y <= 0.4 + 1.8 * (1 - q(x, z));
  a.fill(1, lower, (x, y, z) => (y < -1 && rOf(x, z) >= 2.5 && rOf(x, z) <= 5 ? C.glowCyan : C.iron));
  a.ring(R + 0.25, 0.25, 12, true);
  return a.blocks;
}

/** 背の高いドームに丸窓、下に 3 つの球（直径 24 m） */
function bell(): Block[] {
  const a = new Assembler();
  const base: Pred = (x, y, z) => y > -3 && y < 0 && rOf(x, z) <= 12 - (y + 3);
  a.fill(1, base, (_x, y) => (y < -2 ? C.orange : C.beige));
  const body: Pred = (x, y, z) => y > 0 && y < 6 && rOf(x, z) <= 8.5 - (y / 6) * 2.5;
  a.fill(1, body, (x, y, z) => {
    const ang = (Math.atan2(x, -z) / (Math.PI * 2)) * 6;
    return y > 2 && y < 4 && Math.abs(ang - Math.round(ang)) < 0.12 ? C.glowYellow : C.beige;
  });
  const dome: Pred = (x, y, z) => y > 6 && Math.hypot(x, y - 6, z) <= 6;
  a.fill(1, dome, () => C.water);
  for (let k = 0; k < 3; k++) {
    const ang = (k / 3) * Math.PI * 2 + Math.PI / 3;
    const bx = Math.sin(ang) * 6;
    const bz = -Math.cos(ang) * 6;
    a.fill(0, (x, y, z) => Math.hypot(x - bx, y + 4.6, z - bz) <= 2.2, () => C.iron);
  }
  a.ring(12.25, -2.75, 10, true);
  return a.blocks;
}

/** 光る球のまわりに 2 重の輪（直径 36 m） */
function ring(): Block[] {
  const a = new Assembler();
  a.fill(1, (x, y, z) => Math.hypot(x, y, z) <= 5.6, () => C.glowCyan);
  a.fill(1, (x, y, z) => (rOf(x, z) - 11) ** 2 + y * y <= 1.7 ** 2, () => C.purple);
  a.fill(1, (x, y, z) => (rOf(x, z) - 17) ** 2 + y * y <= 1.05 ** 2, () => C.teal);
  // 輪をつなぐ 4 本の腕
  a.fill(
    0,
    (x, y, z) => {
      const r = rOf(x, z);
      if (Math.abs(y) > 0.5 || r < 5 || r > 17) return false;
      const u = (x + z) / Math.SQRT2;
      const v = (x - z) / Math.SQRT2;
      return Math.min(Math.abs(u), Math.abs(v)) <= 0.5;
    },
    () => C.gray,
  );
  a.ring(18.25, 0.25, 16, true);
  return a.blocks;
}

const BUILDERS: Record<HullType, () => Block[]> = { saucer, bell, ring };

/** 描く船：形の名前（同じ名前なら同じ形）とブロック。描く側（src/render/ship-models.ts）は、名前ごとに面を 1 回だけ作る */
export interface ShipShape {
  key: string;
  blocks: readonly Block[];
}
/** 最初から選べる船の、形の名前 */
export const presetKey = (hull: HullType): string => `preset:${hull}`;
/** 自分で作った船の、形の名前（サーバーが付けた印から） */
export const customKey = (ref: string): string => `ref:${ref}`;
export const presetShape = (hull: HullType): ShipShape => ({ key: presetKey(hull), blocks: presetBlocks(hull) });
const cache = new Map<HullType, Block[]>();

/** 最初から選べる船のブロック（作ったものを覚えておく。書き換えないこと） */
export function presetBlocks(hull: HullType): readonly Block[] {
  let blocks = cache.get(hull);
  if (!blocks) {
    blocks = BUILDERS[hull]();
    cache.set(hull, blocks);
  }
  return blocks;
}
