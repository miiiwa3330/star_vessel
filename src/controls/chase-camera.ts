/**
 * 一人称と三人称の視点（要件 F28。2026-11-10 に、マインクラフトの F5 と同じ 3 つにした。要件 F60）。
 *
 * - 一人称（first）：カメラは船の位置・向きそのもの
 * - 後ろから（third。最初の視点。2026-11-13）：カメラは船の後ろの上から、**船と同じ向き**を見る。
 *   船は画面の真ん中より下に映り、照準（画面の真ん中）は船の上あたりに来る（FPS の三人称と同じ）。
 *   照準の向きは船の前と同じなので、照準の先へまっすぐ進む。回り込み（船のまわりを回る角度）と距離を変えられる
 * - 前から（front）：後ろからと同じで、船の前に回って、船の方を見る
 * 位置は「船から見た相対位置（km・EQJ）」で返す。世界の原点は自分（船）なので、そのままカメラの位置になる。
 */
import { Quaternion, Vector3 } from 'three/webgpu';

export type ViewMode = 'first' | 'third' | 'front';

/** 切り替える順（マインクラフトの F5 と同じ） */
const ORDER: readonly ViewMode[] = ['first', 'third', 'front'];

/**
 * カメラを、後ろへ下がった距離の何倍だけ上に置くか。船は、画面の真ん中から atan(0.26) ≈ 15 度下に映る
 * （縦の視野 60 度なら、真ん中と下の端のあいだの半分より少し下）。見た目のための値
 */
export const HEIGHT_RATIO = 0.26;
/** 船の長さの何倍だけ後ろへ下がるか（初め・最小・最大）。2026-11-13 に、初めを 3 から 4.5 にした（もう少し遠目から） */
const DISTANCE = { initial: 4.5, min: 1.5, max: 40 };
const ORBIT_RAD_PER_PX = 0.006;
const MAX_PITCH = (80 * Math.PI) / 180;

export class ChaseCamera {
  mode: ViewMode = 'third';
  /** 回り込みの角度（船の上の軸まわり・ラジアン。0 で真後ろ） */
  yaw = 0;
  /** 上下の角度（ラジアン。正で上から） */
  pitch = 0;
  distanceFactor = DISTANCE.initial;
  private readonly turn = new Quaternion();
  private readonly axisY = new Vector3(0, 1, 0);
  private readonly axisX = new Vector3(1, 0, 0);

  toggle(): ViewMode {
    this.mode = ORDER[(ORDER.indexOf(this.mode) + 1) % ORDER.length];
    return this.mode;
  }

  /** ドラッグの量（ピクセル）だけ回り込む */
  orbit(dxPx: number, dyPx: number): void {
    this.yaw -= dxPx * ORBIT_RAD_PER_PX;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch + dyPx * ORBIT_RAD_PER_PX));
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
    const d = shipLengthKm * this.distanceFactor;
    // カメラの向き：船の向きから、yaw だけ回り込み（前からは、さらに半周）、pitch だけ見下ろす
    const yaw = this.yaw + (this.mode === 'front' ? Math.PI : 0);
    outQuaternion.copy(ship).multiply(this.turn.setFromAxisAngle(this.axisY, yaw)).multiply(this.turn.setFromAxisAngle(this.axisX, -this.pitch));
    // カメラの位置：カメラ自身から見て、船が前（−Z）の下（−Y）に来るように、後ろと上へ下がる
    outPosition.set(0, HEIGHT_RATIO * d, d).applyQuaternion(outQuaternion);
  }
}
