/**
 * 宇宙船を作る画面の計算（要件 F27。2026-11-21）。three.js・DOM を読み込まない純粋な関数（テストは ship-builder.test.ts）。
 *
 * - 指した先：画面の点から伸ばした線を、0.5 m のマスの格子の中で 1 マスずつ進め、最初に当たったブロックの面を探す（raycast）。
 *   ブロックに当たらなければ、作れる範囲の真ん中の高さの「床」（見えるのは格子の線だけ）に当てる
 * - 置く位置：当たった面にくっつけ、面に沿った向きは、置くブロックの大きさの格子にそろえる（placementFor）
 * - 消す・塗る：選んでいる大きさの立方体の範囲で消す・塗る（regionFor）。2 m のブロックの 1 m 分だけを消すと、
 *   残りは小さいブロックに分けて置き直す（2026-11-21 にオーナーの指示。ブロックの単位ではなく、範囲の単位にした）
 * - 対称：左右（X）・前後（Z）に映した位置にも、同じ操作をする（UFO は左右・前後に対称な形が多いので）
 * - ロック中のなぞり置き：最初に置いた面と同じ平面に沿って置き続ける（planeHit）。1 回のなぞりは、元に戻す 1 回分（beginStroke）
 * - 元に戻す・やり直す（BuildDoc）
 *
 * 位置はすべてマス（0.5 m）。作れる範囲は 0〜GRID。
 */
import { GRID, MAX_BLOCKS, blockCells, cellIndex, occupancy, type Block, type BlockSize } from './ship-blocks';

export type V3 = [number, number, number];

/** 床の高さ（マス）。作れる範囲の真ん中 */
export const FLOOR_Y = GRID / 2;

/**
 * 指した先。どれも axis・sign（面の向き。外向き）、face（面の位置。axis の向きのマス）、point（面の上の当たった点）を持つ
 *   block：ブロックの面。cell：当たったマス
 *   floor：床。sign：上から当てたら 1、下からなら −1
 *   plane：決めた平面（ロック中のなぞり置きで、最初に置いた面と同じ平面）
 */
export type Hit =
  | { kind: 'block'; index: number; cell: V3; axis: 0 | 1 | 2; sign: 1 | -1; face: number; point: V3 }
  | { kind: 'floor'; axis: 1; sign: 1 | -1; face: number; point: V3 }
  | { kind: 'plane'; axis: 0 | 1 | 2; sign: 1 | -1; face: number; point: V3 };

/** 線 o + t·d（マス）と、作れる範囲の箱が重なる t の範囲。重ならなければ null。entryAxis：入ったときに通った面の向き */
function boxSpan(o: V3, d: V3): { t0: number; t1: number; entryAxis: number } | null {
  let t0 = -Infinity;
  let t1 = Infinity;
  let entryAxis = -1;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) {
      if (o[a] < 0 || o[a] > GRID) return null;
      continue;
    }
    let ta = (0 - o[a]) / d[a];
    let tb = (GRID - o[a]) / d[a];
    if (ta > tb) [ta, tb] = [tb, ta];
    if (ta > t0) {
      t0 = ta;
      entryAxis = a;
    }
    t1 = Math.min(t1, tb);
  }
  return t0 <= t1 && t1 >= 0 ? { t0, t1, entryAxis } : null;
}

/** 線の先で、最初に当たるブロックの面（なければ床。床にも当たらなければ null） */
export function raycast(occ: Int32Array, o: V3, d: V3): Hit | null {
  const span = boxSpan(o, d);
  if (span) {
    const start = Math.max(span.t0, 0);
    const p = [0, 1, 2].map((a) => o[a] + d[a] * start);
    const cell = p.map((v) => Math.min(GRID - 1, Math.max(0, Math.floor(v)))) as V3;
    const step = d.map((v) => (v > 0 ? 1 : v < 0 ? -1 : 0));
    const tMax = [0, 1, 2].map((a) => (step[a] === 0 ? Infinity : (cell[a] + (step[a] > 0 ? 1 : 0) - o[a]) / d[a]));
    const tDelta = [0, 1, 2].map((a) => (step[a] === 0 ? Infinity : Math.abs(1 / d[a])));
    // いまのマスに入ったときの t と、通った面の向き
    let t = start;
    let axis = span.t0 >= 0 ? span.entryAxis : -1;
    for (let guard = 0; guard < GRID * 3 + 3; guard++) {
      const index = occ[cellIndex(cell[0], cell[1], cell[2])];
      if (index >= 0) {
        // 線の始まりがブロックの中なら、当たりにしない
        if (axis < 0) return null;
        const sign = (step[axis] > 0 ? -1 : 1) as 1 | -1;
        const point = [0, 1, 2].map((a) => o[a] + d[a] * t) as V3;
        const face = cell[axis] + (sign > 0 ? 1 : 0);
        return { kind: 'block', index, cell: [...cell] as V3, axis: axis as 0 | 1 | 2, sign, face, point };
      }
      const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : tMax[1] < tMax[2] ? 1 : 2;
      t = tMax[a];
      if (t > span.t1) break;
      cell[a] += step[a];
      if (cell[a] < 0 || cell[a] >= GRID) break;
      tMax[a] += tDelta[a];
      axis = a;
    }
  }
  // 床（ブロックに当たらなかったときだけ）
  if (Math.abs(d[1]) < 1e-12) return null;
  const tf = (FLOOR_Y - o[1]) / d[1];
  if (tf <= 0) return null;
  const x = o[0] + d[0] * tf;
  const z = o[2] + d[2] * tf;
  if (x < 0 || x > GRID || z < 0 || z > GRID) return null;
  return { kind: 'floor', axis: 1, sign: d[1] < 0 ? 1 : -1, face: FLOOR_Y, point: [x, FLOOR_Y, z] };
}

/** 線と、向き axis・位置 face の平面が交わる点（範囲の外・後ろなら null）。sign はそのまま返す（置く側） */
export function planeHit(o: V3, d: V3, axis: 0 | 1 | 2, sign: 1 | -1, face: number): Hit | null {
  if (Math.abs(d[axis]) < 1e-12) return null;
  const t = (face - o[axis]) / d[axis];
  if (t <= 0) return null;
  const point = [0, 1, 2].map((a) => (a === axis ? face : o[a] + d[a] * t)) as V3;
  if (point.some((v) => v < 0 || v > GRID)) return null;
  return { kind: 'plane', axis, sign, face, point };
}

/** 当たった面に、大きさ s のブロックを置くときの位置（小さい側の角。マス）。範囲の外にはみ出すなら、内側へ寄せる */
export function placementFor(hit: Hit, s: BlockSize): V3 {
  const n = blockCells({ s });
  const pos: V3 = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    if (a === hit.axis) {
      pos[a] = hit.sign > 0 ? hit.face : hit.face - n;
    } else {
      // 面に沿った向き：当たった点を、ブロックの大きさの格子にそろえる
      pos[a] = Math.floor(Math.min(GRID - 1e-6, Math.max(0, hit.point[a])) / n) * n;
    }
    pos[a] = Math.min(GRID - n, Math.max(0, pos[a]));
  }
  return pos;
}

/**
 * 消す・塗る範囲（大きさ s の立方体の、小さい側の角）。当たったマスを含む、その大きさの格子にそろえた立方体。
 * ブロックに当たっていなければ null
 */
export function regionFor(hit: Hit, s: BlockSize): V3 | null {
  if (hit.kind !== 'block') return null;
  const n = blockCells({ s });
  return hit.cell.map((v) => Math.min(GRID - n, Math.floor(v / n) * n)) as V3;
}

/** 大きさ s のブロックを pos に置けるか（範囲の中で、ほかのブロックと重ならない） */
export function fits(occ: Int32Array, pos: V3, s: BlockSize): boolean {
  const n = blockCells({ s });
  if (pos.some((v) => v < 0 || v + n > GRID)) return false;
  for (let y = pos[1]; y < pos[1] + n; y++)
    for (let z = pos[2]; z < pos[2] + n; z++) for (let x = pos[0]; x < pos[0] + n; x++) if (occ[cellIndex(x, y, z)] >= 0) return false;
  return true;
}

/** 対称の設定 */
export interface Mirror {
  /** 左右（X）に映す */
  x: boolean;
  /** 前後（Z）に映す */
  z: boolean;
}

/** pos（大きさ s）と、対称に映した位置。同じ位置は 1 つにまとめる */
export function mirroredPositions(pos: V3, s: BlockSize, mirror: Mirror): V3[] {
  const n = blockCells({ s });
  const out: V3[] = [pos];
  if (mirror.x) out.push(...out.map((p): V3 => [GRID - p[0] - n, p[1], p[2]]));
  if (mirror.z) out.push(...out.map((p): V3 => [p[0], p[1], GRID - p[2] - n]));
  const seen = new Set<string>();
  return out.filter((p) => {
    const k = p.join(',');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 元に戻せる回数 */
export const UNDO_LIMIT = 200;

/** 作っている船。ブロックの並びと、どのマスにどのブロックがあるか、元に戻すための履歴を持つ */
export class BuildDoc {
  private list: Block[] = [];
  private occ: Int32Array = new Int32Array(GRID * GRID * GRID).fill(-1);
  private readonly undoStack: Block[][] = [];
  private readonly redoStack: Block[][] = [];
  /** なぞっている途中か（途中の変更は、元に戻す 1 回分にまとめる）。pushed：なぞりの前の形を、もう履歴に積んだか */
  private stroke: { pushed: boolean } | null = null;

  constructor(blocks: readonly Block[] = []) {
    this.set([...blocks]);
  }

  get blocks(): readonly Block[] {
    return this.list;
  }
  get occupancy(): Int32Array {
    return this.occ;
  }
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  private set(next: Block[]): void {
    const occ = occupancy(next);
    if (!occ) throw new Error('ブロックが重なっている');
    this.list = next;
    this.occ = occ;
  }

  private commit(next: Block[]): boolean {
    if (!this.stroke?.pushed) {
      this.undoStack.push(this.list);
      if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
      if (this.stroke) this.stroke.pushed = true;
    }
    this.redoStack.length = 0;
    this.set(next);
    return true;
  }

  /** 全部を入れ替える（ひな形を読むなど）。元に戻せる */
  replace(blocks: readonly Block[]): void {
    this.commit([...blocks]);
  }

  /**
   * 置く。pos（大きさ s・色 c）と、対称に映した位置のうち、置ける所にだけ置く。
   * 1 つも置けなければ（重なる・数の上限）何もせず false
   */
  place(pos: V3, s: BlockSize, c: number, mirror: Mirror): boolean {
    const next = [...this.list];
    const occ = this.occ.slice();
    let added = 0;
    for (const p of mirroredPositions(pos, s, mirror)) {
      if (next.length >= MAX_BLOCKS || !fits(occ, p, s)) continue;
      const b: Block = { x: p[0], y: p[1], z: p[2], s, c };
      const n = blockCells(b);
      for (let y = b.y; y < b.y + n; y++) for (let z = b.z; z < b.z + n; z++) for (let x = b.x; x < b.x + n; x++) occ[cellIndex(x, y, z)] = next.length;
      next.push(b);
      added++;
    }
    return added > 0 && this.commit(next);
  }

  /** なぞり（ロック中の長押しスライド）を始める・終える。間の変更は、元に戻す 1 回分 */
  beginStroke(): void {
    this.stroke = { pushed: false };
  }
  endStroke(): void {
    this.stroke = null;
  }

  /** 範囲（pos から大きさ s の立方体。対称に映した範囲も）に、ブロックのマスがあるか */
  hasCellsIn(pos: V3, s: BlockSize, mirror: Mirror): boolean {
    const n = blockCells({ s });
    for (const p of mirroredPositions(pos, s, mirror))
      for (let y = p[1]; y < p[1] + n; y++)
        for (let z = p[2]; z < p[2] + n; z++) for (let x = p[0]; x < p[0] + n; x++) if (this.occ[cellIndex(x, y, z)] >= 0) return true;
    return false;
  }

  /** 範囲を消す（対称に映した範囲も）。範囲にかかったブロックは、範囲の外の分を小さいブロックに分けて残す */
  eraseRegion(pos: V3, s: BlockSize, mirror: Mirror): boolean {
    return this.editRegion(pos, s, mirror, () => null);
  }

  /** 範囲を色 c に塗る（対称に映した範囲も）。何も変わらなければ false */
  paintRegion(pos: V3, s: BlockSize, c: number, mirror: Mirror): boolean {
    return this.editRegion(pos, s, mirror, () => c);
  }

  /**
   * 範囲の中のマスの色を recolor で変える（null なら消す）。範囲にかかったブロックは、マスごとの色に分けてから、
   * もとのブロックの格子にそろえた、なるべく大きいブロックで置き直す。数の上限を超えるなら何もせず false
   */
  private editRegion(pos: V3, s: BlockSize, mirror: Mirror, recolor: (c: number) => number | null): boolean {
    const n = blockCells({ s });
    const regions = mirroredPositions(pos, s, mirror);
    const inRegion = (x: number, y: number, z: number) =>
      regions.some((p) => x >= p[0] && x < p[0] + n && y >= p[1] && y < p[1] + n && z >= p[2] && z < p[2] + n);
    const touched = new Set<number>();
    for (const p of regions)
      for (let y = p[1]; y < p[1] + n; y++)
        for (let z = p[2]; z < p[2] + n; z++)
          for (let x = p[0]; x < p[0] + n; x++) {
            const i = this.occ[cellIndex(x, y, z)];
            if (i >= 0) touched.add(i);
          }
    if (touched.size === 0) return false;
    const next: Block[] = this.list.filter((_, i) => !touched.has(i));
    let changed = false;
    for (const i of touched) {
      const b = this.list[i];
      const m = blockCells(b);
      // もとのブロックの中のマスごとの色（−1 は消す）
      const colors = new Int16Array(m * m * m);
      for (let y = 0; y < m; y++)
        for (let z = 0; z < m; z++)
          for (let x = 0; x < m; x++) {
            const inside = inRegion(b.x + x, b.y + y, b.z + z);
            const c = inside ? recolor(b.c) : b.c;
            colors[(y * m + z) * m + x] = c === null ? -1 : c;
            if (c !== b.c) changed = true;
          }
      next.push(...retile(b, colors));
    }
    if (!changed || next.length > MAX_BLOCKS) return false;
    return this.commit(next);
  }

  undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.redoStack.push(this.list);
    this.set(prev);
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(this.list);
    this.set(next);
    return true;
  }
}

/**
 * ブロック b の中のマスごとの色（−1 は空き）を、b の格子にそろえた、なるべく大きいブロックで並べ直す。
 * 全部が同じ色なら、b と同じ大きさのブロック 1 つになる
 */
export function retile(b: Block, colors: Int16Array): Block[] {
  const m = blockCells(b);
  const used = new Uint8Array(m * m * m);
  const out: Block[] = [];
  const at = (x: number, y: number, z: number) => (y * m + z) * m + x;
  for (let s = b.s; s >= 0; s--) {
    const n = blockCells({ s: s as BlockSize });
    for (let y = 0; y < m; y += n)
      for (let z = 0; z < m; z += n)
        for (let x = 0; x < m; x += n) {
          const c = colors[at(x, y, z)];
          if (c < 0 || used[at(x, y, z)]) continue;
          let ok = true;
          for (let dy = 0; dy < n && ok; dy++)
            for (let dz = 0; dz < n && ok; dz++)
              for (let dx = 0; dx < n && ok; dx++) {
                const k = at(x + dx, y + dy, z + dz);
                if (used[k] || colors[k] !== c) ok = false;
              }
          if (!ok) continue;
          for (let dy = 0; dy < n; dy++) for (let dz = 0; dz < n; dz++) for (let dx = 0; dx < n; dx++) used[at(x + dx, y + dy, z + dz)] = 1;
          out.push({ x: b.x + x, y: b.y + y, z: b.z + z, s: s as BlockSize, c });
        }
  }
  return out;
}
