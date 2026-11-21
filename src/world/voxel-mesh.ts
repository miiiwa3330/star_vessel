/**
 * ブロックの船を、描くための面（三角形）にする（要件 F27）。three.js を読み込まない純粋な関数（テストは voxel-mesh.test.ts）。
 *
 * 0.5 m のマスに色を塗ってから、マスの境目のうち「片側だけが埋まっている」面だけを出し、同じ向き・同じ色で隣り合う面は
 * 1 枚の四角にまとめる（greedy meshing）。ブロックの大きさが混ざっていても、見えない面（くっついた面・中の面）は出ない。
 * 光る色（PALETTE の glow）の面は、別の入れ物に分ける（光を受けない描き方にするため）。
 */
import { CELL_M, GRID, PALETTE, blockCells, cellIndex, type Block } from './ship-blocks';

export interface MeshPart {
  /** 頂点の位置（m） */
  positions: Float32Array;
  normals: Float32Array;
  /** 頂点の色（線形の RGB） */
  colors: Float32Array;
  indices: Uint32Array;
}

export interface ShipMesh {
  solid: MeshPart;
  glow: MeshPart;
  /** ブロックのある範囲の大きさ（m） */
  sizeM: { x: number; y: number; z: number };
  /** 船の大きさ（m）。横（x・z）の長い方。カメラの距離・ベイパーの太さなどに使う */
  lengthM: number;
  /** 範囲の真ん中の位置（m。origin が grid のとき、範囲の真ん中から。bounds のときは 0） */
  centerM: { x: number; y: number; z: number };
}

/**
 * 原点の置き方。bounds：ブロックのある範囲の真ん中（世界で船を描くとき。原点が船の中心）、
 * grid：作れる範囲（40 m の箱）の真ん中（作る画面で使う。ブロックを足しても位置が動かない）
 */
export type MeshOrigin = 'bounds' | 'grid';

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const LINEAR = PALETTE.map((p) => [toLinear(((p.hex >> 16) & 255) / 255), toLinear(((p.hex >> 8) & 255) / 255), toLinear((p.hex & 255) / 255)]);

class PartBuilder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];
  readonly indices: number[] = [];
  quad(corners: number[][], normal: number[], color: number): void {
    const base = this.positions.length / 3;
    const rgb = LINEAR[color];
    for (const c of corners) {
      this.positions.push(c[0], c[1], c[2]);
      this.normals.push(normal[0], normal[1], normal[2]);
      this.colors.push(rgb[0], rgb[1], rgb[2]);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  build(): MeshPart {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      colors: new Float32Array(this.colors),
      indices: new Uint32Array(this.indices),
    };
  }
}

/** ブロックの船を面にする。ブロックが無ければ、面の無い入れ物を返す */
export function buildShipMesh(blocks: readonly Block[], origin: MeshOrigin = 'bounds'): ShipMesh {
  const grid = new Uint8Array(GRID * GRID * GRID);
  const lo = [GRID, GRID, GRID];
  const hi = [0, 0, 0];
  for (const b of blocks) {
    const n = blockCells(b);
    const p = [b.x, b.y, b.z];
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], p[a]);
      hi[a] = Math.max(hi[a], p[a] + n);
    }
    for (let y = b.y; y < b.y + n; y++)
      for (let z = b.z; z < b.z + n; z++) for (let x = b.x; x < b.x + n; x++) grid[cellIndex(x, y, z)] = b.c + 1;
  }
  const solid = new PartBuilder();
  const glow = new PartBuilder();
  if (blocks.length === 0) {
    const empty = solid.build();
    return { solid: empty, glow: empty, sizeM: { x: 0, y: 0, z: 0 }, lengthM: 1, centerM: { x: 0, y: 0, z: 0 } };
  }
  const mid = (a: number) => (origin === 'bounds' ? (lo[a] + hi[a]) / 2 : GRID / 2);
  const o = [mid(0), mid(1), mid(2)];
  const at = (p: number[]) => grid[cellIndex(p[0], p[1], p[2])];
  const toM = (p: number[]) => [(p[0] - o[0]) * CELL_M, (p[1] - o[1]) * CELL_M, (p[2] - o[2]) * CELL_M];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const nu = hi[u] - lo[u];
    const nv = hi[v] - lo[v];
    const mask = new Int16Array(nu * nv);
    const p = [0, 0, 0];
    for (let k = lo[d]; k <= hi[d]; k++) {
      // k の面：マス k−1 と k の境目。片側だけが埋まっていれば、埋まっている側の色で面を出す（正：+d 向き、負：−d 向き）
      for (let j = 0; j < nv; j++)
        for (let i = 0; i < nu; i++) {
          p[u] = lo[u] + i;
          p[v] = lo[v] + j;
          p[d] = k - 1;
          const a = k - 1 >= lo[d] ? at(p) : 0;
          p[d] = k;
          const b = k < hi[d] ? at(p) : 0;
          mask[j * nu + i] = a && !b ? a : !a && b ? -b : 0;
        }
      // 同じ値が並ぶところを、1 枚の四角にまとめる
      for (let j = 0; j < nv; j++)
        for (let i = 0; i < nu; ) {
          const m = mask[j * nu + i];
          if (m === 0) {
            i++;
            continue;
          }
          let w = 1;
          while (i + w < nu && mask[j * nu + i + w] === m) w++;
          let h = 1;
          grow: while (j + h < nv) {
            for (let x = 0; x < w; x++) if (mask[(j + h) * nu + i + x] !== m) break grow;
            h++;
          }
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask[(j + y) * nu + i + x] = 0;
          const corner = (du: number, dv: number) => {
            const c = [0, 0, 0];
            c[d] = k;
            c[u] = lo[u] + i + du;
            c[v] = lo[v] + j + dv;
            return toM(c);
          };
          const a0 = corner(0, 0);
          const a1 = corner(w, 0);
          const a2 = corner(w, h);
          const a3 = corner(0, h);
          const normal = [0, 0, 0];
          normal[d] = m > 0 ? 1 : -1;
          const color = Math.abs(m) - 1;
          // u × v = d なので、+d 向きは a0→a1→a2→a3 が外から見て左回り。−d 向きは逆に回る
          const corners = m > 0 ? [a0, a1, a2, a3] : [a0, a3, a2, a1];
          (PALETTE[color].glow ? glow : solid).quad(corners, normal, color);
          i += w;
        }
    }
  }
  const sizeM = { x: (hi[0] - lo[0]) * CELL_M, y: (hi[1] - lo[1]) * CELL_M, z: (hi[2] - lo[2]) * CELL_M };
  const center = (a: number) => ((lo[a] + hi[a]) / 2 - o[a]) * CELL_M;
  return {
    solid: solid.build(),
    glow: glow.build(),
    sizeM,
    lengthM: Math.max(1, sizeM.x, sizeM.z),
    centerM: { x: center(0), y: center(1), z: center(2) },
  };
}
