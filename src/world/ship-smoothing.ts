/**
 * 他のプレイヤーの船を滑らかに動かす。船の状態は 1 秒に 4 回しか届かないので、そのまま描くと届くたびに飛ぶ。
 * 決まりは docs/tech/server.md の「宇宙船の位置のやりとり」。
 *
 * - 位置：届いた状態から速度で予測した位置を描き、新しい状態が届いたときの食い違いは、すぐに消さずに少しずつ消す
 * - 向き：向きの速さは届かないので、いま見えている向きから届いた向きへ、次が届くまでの時間をかけて回す（少しだけ遅れる）
 * - ワープなどで食い違いが大きすぎるときは、滑らせずにその場所へ移す
 */
import { nlerp, type Quat } from './quat';
import type { ShipSnapshot } from './ship-schema';
import { SHIP_SEND_HZ } from './ship-schema';
import type { ShipDesign } from './ship-design';
import { predictShip, shipPositionKm } from './ships';
import { findBody } from './solar-system';
import { add, length, scale, sub, type Vec3 } from './vec';

/** 位置の食い違いが 1/e になるまでの時間（秒）。届く間隔（0.25 秒）より短くして、次が届くまでにほぼ消す。見た目のための値 */
const ERROR_TAU_S = 0.15;
/** 向きを回す時間（秒）。届く間隔と同じにすると、一定の速さで回り続けて見える */
const TURN_S = 1 / SHIP_SEND_HZ;
/** 食い違いがこれ（km）より小さければ、必ず滑らせる */
const MIN_SNAP_KM = 2_000;
/** 食い違いが、船の速さでこの秒数ぶんを超えたら、滑らせずに移す（ワープとみなす） */
const SNAP_SECONDS = 1;

export interface SmoothedShip {
  id: string;
  hue: number;
  design?: ShipDesign;
  /** 太陽中心の位置（km・EQJ） */
  positionKm: Vec3;
  orientation: Quat;
}

interface Track {
  snap: ShipSnapshot;
  errorKm: Vec3;
  turnFrom: Quat;
  turnTo: Quat;
  turned: number;
  orientation: Quat;
}

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const positionAt = (snap: ShipSnapshot, date: Date): Vec3 => shipPositionKm(predictShip(snap, date.getTime()), date);

export class ShipSmoother {
  private readonly tracks = new Map<string, Track>();

  /** 毎フレーム呼ぶ。dt は前のフレームからの秒数 */
  update(snaps: readonly ShipSnapshot[], date: Date, dt: number): SmoothedShip[] {
    const out: SmoothedShip[] = [];
    const seen = new Set<string>();
    const decay = Math.exp(-dt / ERROR_TAU_S);
    for (const snap of snaps) {
      // 基準の天体がまだ分からない船（読み込み前の星のまわりなど）は描かない
      if (findBody(snap.s.anchor) === null) continue;
      seen.add(snap.id);
      let t = this.tracks.get(snap.id);
      if (!t) {
        const q = snap.s.orientation;
        t = { snap, errorKm: ZERO, turnFrom: q, turnTo: q, turned: 1, orientation: q };
        this.tracks.set(snap.id, t);
      } else if (snap.at !== t.snap.at && findBody(t.snap.s.anchor) !== null) {
        // いま見えている位置（前の状態からの予測）と、新しい状態からの予測の差を、食い違いとして残す。
        // 同じ時刻どうしで比べるので、速さが合っていれば差は 0 になる
        const shown = add(positionAt(t.snap, date), t.errorKm);
        const error = sub(shown, positionAt(snap, date));
        const speed = Math.max(length(snap.s.velocityKmS), length(t.snap.s.velocityKmS));
        t.errorKm = length(error) > Math.max(MIN_SNAP_KM, speed * SNAP_SECONDS) ? ZERO : error;
        t.turnFrom = t.orientation;
        t.turnTo = snap.s.orientation;
        t.turned = 0;
        t.snap = snap;
      } else {
        t.snap = snap;
      }
      t.errorKm = scale(t.errorKm, decay);
      t.turned = Math.min(1, t.turned + dt / TURN_S);
      t.orientation = nlerp(t.turnFrom, t.turnTo, t.turned);
      out.push({
        id: snap.id,
        hue: snap.hue,
        design: snap.d,
        positionKm: add(positionAt(snap, date), t.errorKm),
        orientation: t.orientation,
      });
    }
    for (const id of this.tracks.keys()) if (!seen.has(id)) this.tracks.delete(id);
    return out;
  }
}
