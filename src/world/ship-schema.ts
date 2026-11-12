/**
 * 他のプレイヤーの宇宙船（要件 F2・F15・F16）のやりとりの形と確かめ方。サーバー（worker/）とブラウザの両方で使う。
 * three.js・DOM・astronomy-engine を読み込まない。決まりは docs/tech/server.md の「宇宙船の位置のやりとり」。
 */
import type { Quat } from './quat';
import type { BodyId } from './solar-system';
import { KM_PER_LY } from './units';
import type { Vec3 } from './vec';
import { isBodyId } from './warp-schema';
import { isShipDesign, type ShipDesign } from './ship-design';

/** ブラウザが自分の状態を送る回数（1 秒あたり） */
export const SHIP_SEND_HZ = 4;
/** サーバーが 1 人に返す宇宙船の数の上限（近い順） */
export const MAX_SHIPS_SENT = 32;
/** これより長く状態が届かない船は、いないものとして扱う（ms） */
export const SHIP_STALE_MS = 5_000;
/** 1 つの接続から受け付ける間隔の下限（ms）。これより速く送られた分は捨てる */
export const SHIP_MIN_INTERVAL_MS = 150;
/** 手で操縦する速さの上限（要件 F17・仮）。秒速 1,000 光年 */
export const MAX_SPEED_KM_S = 1_000 * KM_PER_LY;

export interface ShipState {
  anchor: BodyId;
  /** 基準の天体の中心からの位置（km・EQJ） */
  offsetKm: Vec3;
  /** 速度（km/s・EQJ）。受け取った側が、次の状態が届くまでの位置を予測するのに使う */
  velocityKmS: Vec3;
  orientation: Quat;
}

/** ブラウザ → サーバー：チャットを送る（要件 F6）。text は cleanChatText で確かめる */
export interface ChatMessage {
  t: 'chat';
  text: string;
}

/** ブラウザ → サーバー。d は自分の船の設計（形。見た目だけなので、サーバーは形が正しいかだけを確かめる） */
export interface StateMessage {
  t: 'state';
  s: ShipState;
  d?: ShipDesign;
}

export interface ShipSnapshot {
  /** 接続ごとの短い ID（アカウントの ID は出さない） */
  id: string;
  /** 船の色（色相 0〜359）。アカウントごとに決まる */
  hue: number;
  s: ShipState;
  /** 船の設計（送ってこない人は無し。受け取った側が決まった船で描く） */
  d?: ShipDesign;
  /** サーバーがこの状態を受け取った時刻（ms・サーバーの時計） */
  at: number;
}

/** サーバー → ブラウザ */
export type ServerMessage =
  | { t: 'hello'; id: string; hue: number; now: number }
  | { t: 'ships'; now: number; ships: ShipSnapshot[] }
  /**
   * 近くの船（または自分）が送ったチャット。from は船の短い ID、hue は送った人の色、
   * name は宇宙船名（サインアップしていない人は null）
   */
  | { t: 'chat'; now: number; from: string; hue: number; name: string | null; text: string };

const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
const isVec = (v: unknown): v is Vec3 => {
  const o = v as Record<string, unknown> | null;
  return !!o && typeof o === 'object' && finite(o.x) && finite(o.y) && finite(o.z);
};
const len = (v: Vec3) => Math.hypot(v.x, v.y, v.z);

/** 受け取った船の状態として正しいか。サーバーは必ずこれで確かめる */
export function isShipState(v: unknown): v is ShipState {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  if (!isBodyId(s.anchor) || !isVec(s.offsetKm) || !isVec(s.velocityKmS)) return false;
  const q = s.orientation as Record<string, unknown> | null;
  if (!q || typeof q !== 'object' || ![q.x, q.y, q.z, q.w].every(finite)) return false;
  const qn = Math.hypot(q.x as number, q.y as number, q.z as number, q.w as number);
  if (Math.abs(qn - 1) > 1e-3) return false;
  // 銀河の外（約 30 万光年）まで、速さは上限の 1.5 倍まで受け付ける
  return len(s.offsetKm) < 3e5 * KM_PER_LY && len(s.velocityKmS) <= MAX_SPEED_KM_S * 1.5;
}

/** 受け取った設計として正しければそれを、でなければ undefined */
export const designOrNone = (v: unknown): ShipDesign | undefined => (isShipDesign(v) ? v : undefined);

/** アカウントの ID から船の色相を決める（FNV-1a）。同じアカウントはいつも同じ色 */
export function hueFromId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 360;
}
