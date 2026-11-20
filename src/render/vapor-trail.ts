/**
 * 宇宙船のベイパー（動いたときに、後ろへ伸びる白い尾。2026-11-13）。
 *
 * 船の速さは毎秒数 m から光の速さの何倍までと幅が広く、世界に置いた軌跡をそのまま描くと、1 フレームで画面の外まで伸びてしまう。
 * なので、軌跡ではなく「船に付いた尾」として描く：動いている向きの反対へ伸びる、先細りの筒。
 * - 長さと濃さは、速さの割合（strength。0〜1 を少し超える）で決める。止まると消える
 * - 向きは、速度の反対の向きへ少し遅れてついていく（曲がると尾が振れる）
 * 宇宙には空気が無いので本物の現象ではない。見た目のための演出
 */
import * as THREE from 'three/webgpu';
import { abs, dot, float, mx_noise_float, normalView, positionLocal, positionView, time, uniform, uv, vec3 } from 'three/tsl';
import type { Vec3 } from '../world/vec';

/** 尾の長さ（船の長さの何倍。strength が 1 のとき）と、根元の太さ（船の長さの何倍の半径） */
const LENGTH_HULLS = 5;
const RADIUS_HULLS = 0.36;
/** 向き・濃さが追いつく速さ（1/秒） */
const TURN_RATE = 7;
const FADE_RATE = 4;

/** 速さの割合（0〜）から、尾の強さ（0〜1.25）。ダッシュ（1 を超える速さ）で少し伸びる */
export const trailStrength = (speedKmS: number, fullSpeedKmS: number): number =>
  fullSpeedKmS > 0 && speedKmS > 0 ? Math.min(1.25, speedKmS / fullSpeedKmS) : 0;

// 筒：根元（y=0）から先（y=1）へ。先を細くする
const geometry = (() => {
  const g = new THREE.CylinderGeometry(0.22, 1, 1, 24, 8, true);
  g.translate(0, 0.5, 0);
  return g;
})();

export class VaporTrail {
  readonly mesh: THREE.Mesh;
  private readonly strength = uniform(0);
  private readonly material: THREE.MeshBasicNodeMaterial;
  private readonly dir = new THREE.Vector3(0, 0, 1);
  private readonly want = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private shown = 0;

  constructor() {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    // 筒のふち（視線に沿う面）を薄くして、やわらかい煙のように
    const soft = abs(dot(normalView, positionView.negate().normalize())).pow(1.5);
    const along = float(1).sub(uv().y); // 1：船のそば、0：尾の先
    // 尾の先へ流れていく、むらのある筋
    const p = positionLocal;
    const wisps = mx_noise_float(vec3(p.x.mul(3), p.y.mul(6).sub(time.mul(2.4)), p.z.mul(3))).mul(0.5).add(0.75);
    m.colorNode = vec3(0.78, 0.9, 1).mul(soft).mul(along.pow(1.6)).mul(wisps).mul(this.strength).mul(0.7);
    this.material = m;
    this.mesh = new THREE.Mesh(geometry, m);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.name = 'vapor-trail';
  }

  /**
   * 毎フレーム呼ぶ。position は船の位置（描く場面の座標）、velocity は船の速度（向きだけ使う）、strength は trailStrength の値
   */
  update(position: Vec3, velocity: Vec3, strength: number, hullLengthKm: number, dt: number): void {
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    if (speed > 0 && strength > 0) {
      this.want.set(-velocity.x / speed, -velocity.y / speed, -velocity.z / speed);
      // 出はじめは、すぐにその向きへ。動いている間は、少し遅れてついていく
      if (this.shown < 0.02) this.dir.copy(this.want);
      else this.dir.lerp(this.want, 1 - Math.exp(-TURN_RATE * dt)).normalize();
    }
    this.shown += (strength - this.shown) * (1 - Math.exp(-FADE_RATE * dt));
    if (this.shown < 0.01) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.strength.value = Math.min(1, this.shown);
    const r = hullLengthKm * RADIUS_HULLS;
    this.mesh.position.set(position.x, position.y, position.z);
    this.mesh.scale.set(r, hullLengthKm * LENGTH_HULLS * this.shown, r);
    this.mesh.quaternion.setFromUnitVectors(this.up, this.dir);
  }

  dispose(): void {
    this.material.dispose();
  }
}
