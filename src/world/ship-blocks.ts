/**
 * ブロックで作る宇宙船（要件 F27。2026-11-21 にオーナーの指示）。サーバー（worker/）とブラウザの両方で使う。
 * three.js・DOM・astronomy-engine を読み込まない。決まりは docs/tech/ships.md の「ブロックの船」。
 *
 * - 1 ブロック = 1 m。作れる範囲は縦・横・奥行きとも 40 m
 * - ブロックの大きさは 3 種類：ハーフ（0.5 m の立方体）・ノーマル（1 m）・ダブル（2 m）
 * - 置く位置は 0.5 m の格子（1 マス = 0.5 m。範囲は 80 × 80 × 80 マス）。ブロックは重ねられない
 * - 色は決まった色の表（PALETTE）から選ぶ。光る色もある
 *
 * 保存・送るときは、1 ブロックを 4 バイトにまとめ、base64 の文字列にする（encodeBlocks）。
 */

/** 1 マスの大きさ（m） */
export const CELL_M = 0.5;
/** 作れる範囲（マス。80 マス = 40 m） */
export const GRID = 80;
/** 作れる範囲（m） */
export const BUILD_RANGE_M = GRID * CELL_M;
/** ブロックの数の上限（**仮**。保存の大きさ 16 KB と、描く重さから） */
export const MAX_BLOCKS = 4096;

/** ブロックの大きさ（マスの数）。s の値の順：0 ハーフ・1 ノーマル・2 ダブル */
export const BLOCK_SIZES = [
  { id: 'half', cells: 1, nameJa: 'ハーフ', label: '0.5' },
  { id: 'normal', cells: 2, nameJa: 'ノーマル', label: '1' },
  { id: 'double', cells: 4, nameJa: 'ダブル', label: '2' },
] as const;
export type BlockSize = 0 | 1 | 2;

/**
 * 色の表（見た目のための色。**仮**）。glow は光るブロック（光を受けずに、自分で光る）。
 * 並びを変えると保存した船の色が変わるので、足すときは後ろに足す
 */
export const PALETTE: readonly { hex: number; glow: boolean; nameJa: string }[] = [
  { hex: 0xf2f3f5, glow: false, nameJa: '白' },
  { hex: 0xb9bec8, glow: false, nameJa: '銀' },
  { hex: 0x6f7480, glow: false, nameJa: '灰' },
  { hex: 0x33363e, glow: false, nameJa: '鉄' },
  { hex: 0x15161a, glow: false, nameJa: '黒' },
  { hex: 0xe0433a, glow: false, nameJa: '赤' },
  { hex: 0xf28b26, glow: false, nameJa: '橙' },
  { hex: 0xf6d43c, glow: false, nameJa: '黄' },
  { hex: 0x92d53c, glow: false, nameJa: '黄緑' },
  { hex: 0x2fa850, glow: false, nameJa: '緑' },
  { hex: 0x1fb5a3, glow: false, nameJa: '青緑' },
  { hex: 0x3cc8f0, glow: false, nameJa: '水色' },
  { hex: 0x3b6ef0, glow: false, nameJa: '青' },
  { hex: 0x5c46d6, glow: false, nameJa: '藍' },
  { hex: 0x9b4fe0, glow: false, nameJa: '紫' },
  { hex: 0xf06ba8, glow: false, nameJa: '桃' },
  { hex: 0x8b5a35, glow: false, nameJa: '茶' },
  { hex: 0xe8d3a8, glow: false, nameJa: 'ベージュ' },
  { hex: 0xffffff, glow: true, nameJa: '光る白' },
  { hex: 0x7ad8ff, glow: true, nameJa: '光る水色' },
  { hex: 0x7dffb0, glow: true, nameJa: '光る緑' },
  { hex: 0xffe07a, glow: true, nameJa: '光る黄' },
  { hex: 0xff7a8a, glow: true, nameJa: '光る赤' },
  { hex: 0xff8af0, glow: true, nameJa: '光る桃' },
];

/** ブロック 1 つ。x・y・z は小さい側の角の位置（マス。0〜79）。+Y が上、−Z が船の前 */
export interface Block {
  x: number;
  y: number;
  z: number;
  s: BlockSize;
  /** 色（PALETTE の番号） */
  c: number;
}

export const blockCells = (b: Pick<Block, 's'>): number => BLOCK_SIZES[b.s].cells;

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/** 1 つのブロックとして正しいか（範囲の中・大きさ・色） */
export function isBlock(b: Block): boolean {
  if (!isInt(b.s) || b.s < 0 || b.s > 2 || !isInt(b.c) || b.c < 0 || b.c >= PALETTE.length) return false;
  const n = blockCells(b);
  return [b.x, b.y, b.z].every((v) => isInt(v) && v >= 0 && v + n <= GRID);
}

/** マスの番号（範囲の中の 1 マス） */
export const cellIndex = (x: number, y: number, z: number): number => (y * GRID + z) * GRID + x;

/**
 * どのマスを、どのブロックが占めているか（ブロックの番号。空きは −1）。重なりがあれば null。
 * scratch を渡すと確保し直さず使い回せる
 */
export function occupancy(blocks: readonly Block[], scratch?: Int32Array): Int32Array | null {
  const occ = scratch && scratch.length === GRID * GRID * GRID ? scratch.fill(-1) : new Int32Array(GRID * GRID * GRID).fill(-1);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const n = blockCells(b);
    for (let y = b.y; y < b.y + n; y++)
      for (let z = b.z; z < b.z + n; z++)
        for (let x = b.x; x < b.x + n; x++) {
          const k = cellIndex(x, y, z);
          if (occ[k] >= 0) return null;
          occ[k] = i;
        }
  }
  return occ;
}

/** ブロックの並びとして正しいか（数の上限・1 つずつの形・重なり）。サーバーは必ずこれで確かめる */
export function isValidBlocks(blocks: readonly Block[], scratch?: Int32Array): boolean {
  if (blocks.length === 0 || blocks.length > MAX_BLOCKS) return false;
  if (!blocks.every(isBlock)) return false;
  return occupancy(blocks, scratch) !== null;
}

// ---- 4 バイトにまとめる：x 7 ビット・y 7・z 7・大きさ 2・色 5（合わせて 28 ビット。上の 4 ビットは 0） ----

const pack = (b: Block): number => (b.x | (b.y << 7) | (b.z << 14) | (b.s << 21) | (b.c << 23)) >>> 0;
const unpack = (v: number): Block => ({
  x: v & 127,
  y: (v >>> 7) & 127,
  z: (v >>> 14) & 127,
  s: ((v >>> 21) & 3) as BlockSize,
  c: (v >>> 23) & 31,
});

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Map([...B64].map((ch, i) => [ch, i]));

function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

function fromBase64(text: string): Uint8Array | null {
  if (text.length % 4 !== 0) return null;
  const pad = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const body = text.slice(0, text.length - pad);
  const out = new Uint8Array(Math.floor((body.length * 6) / 8));
  let buf = 0;
  let bits = 0;
  let o = 0;
  for (const ch of body) {
    const v = B64_INDEX.get(ch);
    if (v === undefined) return null;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buf >> bits) & 255;
    }
    buf &= (1 << bits) - 1;
  }
  return out;
}

/** 文字列の長さの上限（ブロックの上限の分） */
export const MAX_BLOCKS_TEXT = Math.ceil((MAX_BLOCKS * 4) / 3) * 4;

/**
 * ブロックの並びを、保存・送るための文字列にする。並びの順は決まった順にそろえる
 * （同じ船はいつも同じ文字列になる。サーバーはこの文字列から船の印〈ref〉を作る）
 */
export function encodeBlocks(blocks: readonly Block[]): string {
  const values = blocks.map(pack).sort((a, b) => a - b);
  const bytes = new Uint8Array(values.length * 4);
  values.forEach((v, i) => {
    bytes[i * 4] = v & 255;
    bytes[i * 4 + 1] = (v >>> 8) & 255;
    bytes[i * 4 + 2] = (v >>> 16) & 255;
    bytes[i * 4 + 3] = (v >>> 24) & 255;
  });
  return toBase64(bytes);
}

/** 文字列からブロックの並びに戻す。形が正しくなければ（範囲の外・重なり・上限を超える）null */
export function decodeBlocks(text: unknown, scratch?: Int32Array): Block[] | null {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_BLOCKS_TEXT) return null;
  const bytes = fromBase64(text);
  if (!bytes || bytes.length % 4 !== 0) return null;
  const blocks: Block[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    const v = (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)) >>> 0;
    if (v >>> 28 !== 0) return null;
    blocks.push(unpack(v));
  }
  return isValidBlocks(blocks, scratch) ? blocks : null;
}

/** 決まった順にそろえた文字列か（サーバーが保存する前に確かめる。同じ船が違う文字列で保存されないように） */
export const canonicalBlocks = (text: string, scratch?: Int32Array): string | null => {
  const blocks = decodeBlocks(text, scratch);
  return blocks ? encodeBlocks(blocks) : null;
};

/** 船の印（ref）の形。サーバーが、ブロックの文字列の SHA-256 の前の 16 バイトから作る（16 進 32 文字） */
export const isBlocksRef = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);
