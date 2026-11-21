/**
 * 宇宙船の設計（要件 F27）。プレイヤーごとにサーバーへ保存し、宇宙の部屋で他のプレイヤーにも配る。
 * サーバー（worker/）とブラウザの両方で使う。three.js・DOM・astronomy-engine を読み込まない。
 *
 * 2026-11-21（版 2）：ブロックで自分の船を作れるようにした（ship-blocks.ts）。最初から選べる 3 つの UFO も、同じブロックで組んだもの
 * （ship-presets.ts）。設計は「どれを使うか（use）」と「自分で作った船のブロックの一覧（customs）」を持つ。
 * 自分で作れる船は MAX_CUSTOM_SHIPS 個まで（同じ日に、1 つから増やした）。
 * 前の版（{ v: 1, hull }）も読める。知らない欄は無視せずに「正しくない」として扱う（版を上げて欄を足す）。
 * 決まりは docs/tech/ships.md。
 */
import { decodeBlocks, isBlocksRef, MAX_BLOCKS_TEXT } from './ship-blocks';

/** 設計の版。欄を足すときは版を上げ、前の版も読めるようにする */
export const SHIP_DESIGN_VERSION = 2;

/** 最初から選べる船（どれも UFO の形。2026-11-05 にオーナーが決めた） */
export const HULL_TYPES = ['saucer', 'bell', 'ring'] as const;
export type HullType = (typeof HULL_TYPES)[number];
/** 自分で作れる船の数の上限（**仮**） */
export const MAX_CUSTOM_SHIPS = 8;
/** 使う船：最初から選べる船か、自分で作った船（customs の番号） */
export type ShipChoice = HullType | number;

export interface ShipDesign {
  v: typeof SHIP_DESIGN_VERSION;
  use: ShipChoice;
  /** 自分で作った船のブロックの一覧（ship-blocks.ts の encodeBlocks）。最初から選べる船を使っているときも、作ったものは残す。無ければ欄ごと無い */
  customs?: string[];
}

/**
 * 宇宙の部屋で配る、船の見た目の印。ブロックそのものは大きい（最大 22 KB）ので、1 秒に 4 回送る状態には入れず、
 * 自分で作った船は印（ref）だけを送る。受け取った側は、GET /api/ship/blocks/:ref でブロックを読む
 */
export type ShipLook = { v: typeof SHIP_DESIGN_VERSION; hull: HullType } | { v: typeof SHIP_DESIGN_VERSION; ref: string };

/** 船ごとの名前（仮）と説明 */
export const HULLS: Readonly<Record<HullType, { nameJa: string; descriptionJa: string }>> = {
  saucer: { nameJa: 'ソーサー（仮）', descriptionJa: '平たい円盤に小さなドーム。いちばん UFO らしい形。直径 30 m' },
  bell: { nameJa: 'ベル（仮）', descriptionJa: '背の高いドームに丸窓、下に 3 つの球。直径 24 m' },
  ring: { nameJa: 'リング（仮）', descriptionJa: '光る球のまわりに 2 重の輪。直径 36 m' },
};
/** 自分で作った船の名前（i は customs の番号） */
export const customNameJa = (i: number): string => `マイ UFO ${i + 1}`;

export const isHullType = (v: unknown): v is HullType => typeof v === 'string' && (HULL_TYPES as readonly string[]).includes(v);

const plain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const onlyKeys = (o: Record<string, unknown>, keys: string[]) => Object.keys(o).every((k) => keys.includes(k));

/**
 * 設計として正しければ、版 2 の形にして返す（前の版 { v: 1, hull } も読む）。正しくなければ null。
 * サーバーは受け取ったものを必ずこれで確かめる。blocks は形（範囲・重なり・数）まで確かめる
 */
export function parseShipDesign(v: unknown): ShipDesign | null {
  if (!plain(v)) return null;
  if (v.v === 1) return isHullType(v.hull) && onlyKeys(v, ['v', 'hull']) ? { v: SHIP_DESIGN_VERSION, use: v.hull } : null;
  if (v.v !== SHIP_DESIGN_VERSION || !onlyKeys(v, ['v', 'use', 'customs'])) return null;
  const customs = v.customs ?? [];
  if (!Array.isArray(customs) || customs.length > MAX_CUSTOM_SHIPS) return null;
  if (!customs.every((c) => typeof c === 'string' && c.length <= MAX_BLOCKS_TEXT && decodeBlocks(c) !== null)) return null;
  const use = v.use;
  const okUse = isHullType(use) || (typeof use === 'number' && Number.isInteger(use) && use >= 0 && use < customs.length);
  if (!okUse) return null;
  return customs.length > 0 ? { v: SHIP_DESIGN_VERSION, use, customs: customs as string[] } : { v: SHIP_DESIGN_VERSION, use };
}

export const isShipDesign = (v: unknown): v is ShipDesign => parseShipDesign(v) !== null;

/** 見た目の印として正しければ、版 2 の形にして返す（前の版の設計 { v: 1, hull } も、印として読む） */
export function parseShipLook(v: unknown): ShipLook | null {
  if (!plain(v)) return null;
  if (v.v === 1) return isHullType(v.hull) && onlyKeys(v, ['v', 'hull']) ? { v: SHIP_DESIGN_VERSION, hull: v.hull } : null;
  if (v.v !== SHIP_DESIGN_VERSION) return null;
  if (isHullType(v.hull) && onlyKeys(v, ['v', 'hull'])) return { v: SHIP_DESIGN_VERSION, hull: v.hull };
  if (isBlocksRef(v.ref) && onlyKeys(v, ['v', 'ref'])) return { v: SHIP_DESIGN_VERSION, ref: v.ref };
  return null;
}

/** 設計を決めていない人の船。アカウントの ID から決める（同じ人はいつも同じ） */
export function defaultHullFor(id: string): HullType {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return HULL_TYPES[(h >>> 0) % HULL_TYPES.length];
}

/** 使っている、自分で作った船のブロック（文字列）。最初から選べる船を使っていれば null */
export const usedCustom = (design: ShipDesign | null): string | null =>
  design && typeof design.use === 'number' ? (design.customs?.[design.use] ?? null) : null;

/** 設計と、サーバーが付けた印（ref）から、宇宙の部屋で配る見た目の印。自分で作った船でも、印がまだ無ければソーサー */
export function lookOf(design: ShipDesign | null, ref: string | null): ShipLook {
  if (design && typeof design.use === 'number' && ref) return { v: SHIP_DESIGN_VERSION, ref };
  return { v: SHIP_DESIGN_VERSION, hull: design && isHullType(design.use) ? design.use : 'saucer' };
}
