/**
 * ワープホールを描く。光る輪を、ワープホールの位置（自分から見た相対位置）に置く。
 * 大きさは見た目のための値（半径 300 km）。遠くからは小さすぎて見えないので、レーダーで場所を示す。
 */
import * as THREE from 'three/webgpu';
import { warpPositionKm, type WarpHole } from '../world/warp';
import { sub, type Vec3 } from '../world/vec';

const RING_RADIUS_KM = 300;
const TUBE_RADIUS_KM = 18;
const SPIN_RAD_PER_S = 0.4;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export class WarpView {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<string, THREE.Mesh>();
  private warps: readonly WarpHole[] = [];
  private readonly facing = new THREE.Vector3();
  private readonly spin = new THREE.Quaternion();
  private readonly geometry = new THREE.TorusGeometry(RING_RADIUS_KM, TUBE_RADIUS_KM, 16, 96);
  private readonly material = new THREE.MeshBasicNodeMaterial({
    color: new THREE.Color(0.45, 0.9, 1.0),
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  setWarps(warps: readonly WarpHole[]): void {
    this.warps = warps;
    const ids = new Set(warps.map((w) => w.id));
    for (const [id, mesh] of this.meshes) {
      if (!ids.has(id)) {
        this.group.remove(mesh);
        this.meshes.delete(id);
      }
    }
    for (const w of warps) {
      if (this.meshes.has(w.id)) continue;
      const mesh = new THREE.Mesh(this.geometry, this.material);
      mesh.name = `warp:${w.id}`;
      this.meshes.set(w.id, mesh);
      this.group.add(mesh);
    }
  }

  update(date: Date, observerKm: Vec3, timeS: number): void {
    for (const w of this.warps) {
      const mesh = this.meshes.get(w.id);
      if (!mesh) continue;
      const rel = sub(warpPositionKm(w, date), observerKm);
      mesh.position.set(rel.x, rel.y, rel.z);
      // 輪の面を、正面の向き（facing）に向ける。TorusGeometry の輪は XY 平面にあり、正面は +Z
      this.facing.set(w.facing.x, w.facing.y, w.facing.z);
      mesh.quaternion.setFromUnitVectors(Z_AXIS, this.facing);
      this.spin.setFromAxisAngle(Z_AXIS, timeS * SPIN_RAD_PER_S);
      mesh.quaternion.multiply(this.spin);
    }
  }
}
