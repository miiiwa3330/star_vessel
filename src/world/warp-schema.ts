/**
 * ワープホールのデータの形と、その確かめ方。サーバー（worker/）とブラウザの両方で使う。
 * three.js・DOM・astronomy-engine を読み込まない。
 */
import { isArmCode, isSystemCode, knownSystemArm, SOL_BODY_NUMBERS, SYSTEM_SOL } from './address';
import type { ArmCode } from './galaxy';
import type { BodyId } from './solar-system';
import type { Vec3 } from './vec';

/** 1 人が置けるワープホールの数（要件 F13） */
export const MAX_WARPS_PER_PLAYER = 3;

/** ブラウザがサーバーに送る、置く場所 */
export interface WarpPlacement {
  anchor: BodyId;
  /** 基準の天体の中心からの位置（km・EQJ） */
  offsetKm: Vec3;
  /** 輪の正面の向き（単位ベクトル・EQJ） */
  facing: Vec3;
  /** 恒星系の記号（SOL・H＋HYG の id・G＋マス目）。ブラウザが星のデータから決める */
  system: string;
  /** 恒星系のある腕 */
  arm: ArmCode;
}

/** サーバーが返す、置かれたワープホール */
export interface WarpHole {
  id: string;
  /** 宇宙の住所（例：MW-ORI-SOL-3-1-002）。サーバーが番号を振る */
  code: string;
  anchor: BodyId;
  offsetKm: Vec3;
  facing: Vec3;
  /** 置いた時刻（ISO 8601） */
  createdAt: string;
  /** 自分が置いたものか（消せるのは本人だけ） */
  mine: boolean;
}

export const isBodyId = (v: unknown): v is BodyId => typeof v === 'string' && Object.hasOwn(SOL_BODY_NUMBERS, v);

/** 基準の天体からの距離の上限（km）。太陽系の外は太陽を基準にするので、銀河の大きさ（約 10 万光年）まで許す */
const MAX_OFFSET_KM = 1e18;

const isVec = (v: unknown): v is Vec3 => {
  const o = v as Record<string, unknown> | null;
  return !!o && typeof o === 'object' && [o.x, o.y, o.z].every((n) => typeof n === 'number' && Number.isFinite(n));
};
const len = (v: Vec3) => Math.hypot(v.x, v.y, v.z);

/** 置く場所として正しいか。サーバーは受け取ったものを必ずこれで確かめる */
export function isWarpPlacement(v: unknown): v is WarpPlacement {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  if (!isBodyId(p.anchor) || !isVec(p.offsetKm) || !isVec(p.facing) || typeof p.system !== 'string') return false;
  if (!isSystemCode(p.system) || !isArmCode(p.arm)) return false;
  // サーバーが自分で腕を決められる恒星系（太陽系・自動で作った星）は、ブラウザの値と合っていなければ受け付けない
  const arm = knownSystemArm(p.system);
  if (arm !== null && arm !== p.arm) return false;
  // 太陽系の外の恒星系は、太陽を基準にしているときだけ
  if (p.system !== SYSTEM_SOL && p.anchor !== 'Sun') return false;
  if (len(p.offsetKm) > MAX_OFFSET_KM) return false;
  return Math.abs(len(p.facing) - 1) < 1e-6;
}

/** サーバーから受け取ったワープホールとして正しいか */
export function isWarpHole(v: unknown): v is WarpHole {
  if (typeof v !== 'object' || v === null) return false;
  const w = v as Record<string, unknown>;
  return (
    typeof w.id === 'string' &&
    typeof w.code === 'string' &&
    typeof w.createdAt === 'string' &&
    typeof w.mine === 'boolean' &&
    isBodyId(w.anchor) &&
    isVec(w.offsetKm) &&
    isVec(w.facing)
  );
}
