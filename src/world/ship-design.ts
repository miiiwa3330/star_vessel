/**
 * 宇宙船の設計（要件 F27）。プレイヤーごとにサーバーへ保存し、宇宙の部屋で他のプレイヤーにも配る。
 * サーバー（worker/）とブラウザの両方で使う。three.js・DOM・astronomy-engine を読み込まない。
 *
 * いまは 3 種類の船体から選ぶだけ。将来、部品を自由に組み合わせられるようにするため、
 * 設計には版（v）を付け、知らない欄は無視せずに「正しくない」として扱う（版を上げて欄を足す）。
 * 決まりは docs/tech/ships.md。
 */

/** 設計の版。欄を足すときは版を上げ、前の版も読めるようにする */
export const SHIP_DESIGN_VERSION = 1;

/**
 * 船体の種類（いまは 3 種類。どれも UFO の形。2026-11-05 にオーナーが決めた）。
 * 以前のアロー・ディスク・ホーラー（arrow・disk・hauler）はやめた。本番に出す前なので、古い id の保存は正しくないものとして扱う
 */
export const HULL_TYPES = ['saucer', 'bell', 'ring'] as const;
export type HullType = (typeof HULL_TYPES)[number];

export interface ShipDesign {
  v: typeof SHIP_DESIGN_VERSION;
  hull: HullType;
}

/** 船体ごとの名前（仮）と説明、大きさ（直径・km） */
export const HULLS: Readonly<Record<HullType, { nameJa: string; descriptionJa: string; lengthKm: number }>> = {
  saucer: { nameJa: 'ソーサー（仮）', descriptionJa: '平たい円盤に小さなドーム。いちばん UFO らしい形。直径 30 m', lengthKm: 0.03 },
  bell: { nameJa: 'ベル（仮）', descriptionJa: '背の高いドームに丸窓、下に 3 つの球。直径 24 m', lengthKm: 0.024 },
  ring: { nameJa: 'リング（仮）', descriptionJa: '光る球のまわりに 2 重の輪。直径 36 m', lengthKm: 0.036 },
};

export const isHullType = (v: unknown): v is HullType => typeof v === 'string' && (HULL_TYPES as readonly string[]).includes(v);

/** 設計として正しいか。サーバーは受け取ったものを必ずこれで確かめる */
export function isShipDesign(v: unknown): v is ShipDesign {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o);
  return o.v === SHIP_DESIGN_VERSION && isHullType(o.hull) && keys.every((k) => k === 'v' || k === 'hull');
}

/** 設計を決めていない人の船。アカウントの ID から決める（同じ人はいつも同じ） */
export function defaultDesignFor(id: string): ShipDesign {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return { v: SHIP_DESIGN_VERSION, hull: HULL_TYPES[(h >>> 0) % HULL_TYPES.length] };
}
