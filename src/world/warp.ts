/**
 * ワープホールの位置の計算（要件 F9）。ブラウザで使う。
 *
 * - 今いる場所にだけ置ける。ただし自分と重ならないよう、自分の WARP_STANDOFF_KM 前方に、自分の方を向けて置く
 *   （自分が輪の中心にいると、輪が画面を横切る帯に見えてしまうため）
 * - 位置は、置いたときの基準の天体からの相対位置で持つ
 *   （天体は動くので、地球の近くに置いたワープホールは地球と一緒に動く。docs/tech/world-model.md）
 * - 宇宙のどこからでも、一覧から選んで飛べる。着くのは、置いた人が立っていた位置（輪の正面）
 * - 住所のコードはサーバーが付ける（src/world/address.ts・worker/warps.ts）
 */
import { keepOutsideBodies } from './collision';
import { heliocentricPositionKm } from './solar-system';
import { absolutePositionKm, type Observer } from './observer';
import { add, normalize, scale, type Vec3 } from './vec';
import type { WarpHole, WarpPlacement } from './warp-schema';
import type { SystemAndArm } from './address';

/** 自分とワープホールの間の距離（km）。輪の半径（300 km）の数倍 */
export const WARP_STANDOFF_KM = 2_000;

/**
 * いる場所に置くワープホールの位置を決める。forward は自分の進む向き（EQJ）。
 * 前方が天体にふさがれているときは、天体に近づける距離の外まで押し戻した位置に置く。
 * systemOf は位置（太陽中心・km）から恒星系と腕を決める関数（src/world/address.ts の nearestSystem）。
 */
export function planWarpHere(
  observer: Observer,
  forward: Vec3,
  date: Date,
  systemOf: (positionKm: Vec3) => SystemAndArm,
): WarpPlacement {
  const dir = normalize(forward);
  const ahead = keepOutsideBodies(
    { anchor: observer.anchor, offsetKm: add(observer.offsetKm, scale(dir, WARP_STANDOFF_KM)) },
    date,
  );
  return {
    anchor: ahead.anchor,
    offsetKm: ahead.offsetKm,
    facing: scale(dir, -1),
    ...systemOf(absolutePositionKm(ahead, date)),
  };
}

type Placed = Pick<WarpHole, 'anchor' | 'offsetKm' | 'facing'>;

export const warpPositionKm = (w: Placed, date: Date): Vec3 => add(heliocentricPositionKm(w.anchor, date), w.offsetKm);

/** ワープした先の自分の位置。輪の正面、WARP_STANDOFF_KM 離れたところに出る */
export const arriveAt = (w: Placed): Observer => ({
  anchor: w.anchor,
  offsetKm: add(w.offsetKm, scale(w.facing, WARP_STANDOFF_KM)),
});
