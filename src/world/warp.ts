/**
 * ワープホール（要件 F9）。
 *
 * - 今いる場所にだけ置ける。ただし自分と重ならないよう、自分の WARP_STANDOFF_KM 前方に、自分の方を向けて置く
 *   （自分が輪の中心にいると、輪が画面を横切る帯に見えてしまうため）
 * - 位置は、置いたときの基準の天体からの相対位置で持つ
 *   （天体は動くので、地球の近くに置いたワープホールは地球と一緒に動く。docs/tech/world-model.md）
 * - 宇宙のどこからでも、一覧から選んで飛べる。着くのは、置いた人が立っていた位置（輪の正面）
 */
import { keepOutsideBodies } from './collision';
import { bodyInfo, heliocentricPositionKm, type BodyId } from './solar-system';
import type { Observer } from './observer';
import { add, length, normalize, scale, type Vec3 } from './vec';

/** 自分とワープホールの間の距離（km）。輪の半径（300 km）の数倍 */
export const WARP_STANDOFF_KM = 2_000;

export interface WarpHole {
  id: string;
  /** 置いたプレイヤー */
  ownerId: string;
  /** 自動で付ける名前（自由な名前は付けない。docs/product/requirements.md の「決まっていないこと」） */
  name: string;
  anchor: BodyId;
  offsetKm: Vec3;
  /** 輪の正面の向き（単位ベクトル・EQJ）。ワープホールから、置いた人がいた方を向く */
  facing: Vec3;
  /** 置いた時刻（ISO 8601） */
  createdAt: string;
}

/**
 * いる場所にワープホールを作る。forward は自分の進む向き（EQJ）。名前は「基準の天体の近く 番号」。
 * 前方が天体にふさがれているときは、天体に近づける距離の外まで押し戻した位置に置く。
 */
export function createWarpHere(
  observer: Observer,
  forward: Vec3,
  date: Date,
  ownerId: string,
  existing: readonly WarpHole[],
  id: string,
  now: Date,
): WarpHole {
  const sameAnchor = existing.filter((w) => w.anchor === observer.anchor).length;
  const place = observer.anchor === 'Sun' ? '太陽系' : `${bodyInfo(observer.anchor).nameJa}の近く`;
  const dir = normalize(forward);
  const ahead = keepOutsideBodies(
    { anchor: observer.anchor, offsetKm: add(observer.offsetKm, scale(dir, WARP_STANDOFF_KM)) },
    date,
  );
  return {
    id,
    ownerId,
    name: `${place} ${sameAnchor + 1}`,
    anchor: ahead.anchor,
    offsetKm: ahead.offsetKm,
    facing: scale(dir, -1),
    createdAt: now.toISOString(),
  };
}

export const warpPositionKm = (w: WarpHole, date: Date): Vec3 => add(heliocentricPositionKm(w.anchor, date), w.offsetKm);

/** ワープした先の自分の位置。輪の正面、WARP_STANDOFF_KM 離れたところに出る */
export const arriveAt = (w: WarpHole): Observer => ({
  anchor: w.anchor,
  offsetKm: add(w.offsetKm, scale(w.facing, WARP_STANDOFF_KM)),
});

/** 形がワープホールとして正しいか（保存したものを読み込むときに確かめる） */
export function isWarpHole(v: unknown): v is WarpHole {
  if (typeof v !== 'object' || v === null) return false;
  const w = v as Record<string, unknown>;
  const isVec = (v: unknown) => {
    const o = v as Record<string, unknown> | undefined;
    return !!o && [o.x, o.y, o.z].every((n) => typeof n === 'number' && Number.isFinite(n));
  };
  return (
    typeof w.id === 'string' &&
    typeof w.ownerId === 'string' &&
    typeof w.name === 'string' &&
    typeof w.anchor === 'string' &&
    typeof w.createdAt === 'string' &&
    isVec(w.offsetKm) &&
    isVec(w.facing) &&
    Math.abs(length(w.facing as Vec3) - 1) < 1e-6
  );
}
