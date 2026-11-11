/**
 * 一人称と三人称の視点（要件 F28。2026-11-10 に、マインクラフトの F5 と同じ 3 つにした。要件 F60）。
 *
 * - 一人称（first）：カメラは船の位置・向きそのもの
 * - 後ろから（third）：カメラは船の後ろの少し上から船を見る。船が向きを変えるとカメラもついていく。
 *   回り込み（船のまわりを回る角度）と距離を変えられる
 * - 前から（front）：後ろからと同じで、船の前に回って、船の方を見る
 * 位置は「船から見た相対位置（km・EQJ）」で返す。世界の原点は自分（船）なので、そのままカメラの位置になる。
 */
import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';

export type ViewMode = 'first' | 'third' | 'front';

/** 切り替える順（マインクラフトの F5 と同じ） */
const ORDER: readonly ViewMode[] = ['first', 'third', 'front'];

/** 後ろから見下ろす角度（ラジアン） */
const BASE_PITCH = (12 * Math.PI) / 180;
/** 船の長さの何倍の距離から見るか（初め・最小・最大） */
const DISTANCE = { initial: 3, min: 1.5, max: 40 };
const ORBIT_RAD_PER_PX = 0.006;
const MAX_PITCH = (80 * Math.PI) / 180;

export class ChaseCamera {
  mode: ViewMode = 'first';
  /** 回り込みの角度（船の上の軸まわり・ラジアン。0 で真後ろ） */
  yaw = 0;
  /** 上下の角度（ラジアン。正で上から） */
  pitch = 0;
  distanceFactor = DISTANCE.initial;
  /** 船より下（船の上下の向きで、距離に対する割合）を見る。船を画面の上の方に映したいとき（宇宙船を選ぶ画面）に使う */
  aimBelow = 0;
  private readonly m = new Matrix4();
  private readonly local = new Vector3();
  private readonly target = new Vector3();
  private readonly up = new Vector3();

  toggle(): ViewMode {
    this.mode = ORDER[(ORDER.indexOf(this.mode) + 1) % ORDER.length];
    return this.mode;
  }

  /** ドラッグの量（ピクセル）だけ回り込む */
  orbit(dxPx: number, dyPx: number): void {
    this.yaw -= dxPx * ORBIT_RAD_PER_PX;
    this.pitch = Math.max(-MAX_PITCH - BASE_PITCH, Math.min(MAX_PITCH - BASE_PITCH, this.pitch + dyPx * ORBIT_RAD_PER_PX));
  }

  /** 距離を steps 段変える（正で近づく） */
  zoom(steps: number): void {
    this.distanceFactor = Math.max(DISTANCE.min, Math.min(DISTANCE.max, this.distanceFactor * 1.15 ** -steps));
  }

  /** 回り込みを真後ろに戻す */
  reset(): void {
    this.yaw = 0;
    this.pitch = 0;
    this.distanceFactor = DISTANCE.initial;
  }

  /**
   * カメラの位置（船からの相対・km）と向き。ship は船の向き、shipLengthKm は船の長さ
   */
  pose(ship: Quaternion, shipLengthKm: number, outPosition: Vector3, outQuaternion: Quaternion): void {
    if (this.mode === 'first') {
      outPosition.set(0, 0, 0);
      outQuaternion.copy(ship);
      return;
    }
    const pitch = BASE_PITCH + this.pitch;
    const d = shipLengthKm * this.distanceFactor;
    // 船から見て：後ろ（+Z）から、yaw だけ回り、pitch だけ上がった位置。前からは、さらに半周回る
    const yaw = this.yaw + (this.mode === 'front' ? Math.PI : 0);
    this.local.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(d);
    outPosition.copy(this.local).applyQuaternion(ship);
    this.up.set(0, 1, 0).applyQuaternion(ship);
    this.target.copy(this.up).multiplyScalar(-this.aimBelow * d);
    this.m.lookAt(outPosition, this.target, this.up);
    outQuaternion.setFromRotationMatrix(this.m);
  }
}
