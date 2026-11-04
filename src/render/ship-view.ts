/**
 * 他のプレイヤーの宇宙船を描く（要件 F15・F16）。
 *
 * - 船は本物に近い大きさ（全長 40 m）。遠くでは見えないので、航行灯（いつも数ピクセルの光の点）を付ける
 * - 色はプレイヤーごと（サーバーが決める色相）
 * - 形は仮（三角の胴体と翼）。デザインを決めたら差し替える
 */
import * as THREE from 'three/webgpu';
import { float, instancedBufferAttribute, sin, time, uv, exp } from 'three/tsl';
import { shipPositionKm } from '../world/ships';
import type { ShipState } from '../world/ship-schema';
import { sub, type Vec3 } from '../world/vec';

const SHIP_LENGTH_KM = 0.04;
const MAX_SHIPS = 64;
/** 航行灯の大きさ（CSS ピクセル）。ふちをぼかすので、見える大きさはこの 1/3 くらい */
const LIGHT_SIZE_PX = 14;

function createShipGeometry(): THREE.BufferGeometry {
  // 先が −Z（カメラと同じく、前が −Z）を向く、平たい三角の胴体と翼
  const l = SHIP_LENGTH_KM;
  const body = new THREE.ConeGeometry(l * 0.12, l, 8);
  body.rotateX(-Math.PI / 2);
  const wing = new THREE.BoxGeometry(l * 0.8, l * 0.02, l * 0.25);
  wing.translate(0, 0, l * 0.2);
  const merged = new THREE.BufferGeometry();
  const parts = [body.toNonIndexed(), wing.toNonIndexed()];
  const pos = parts.flatMap((g) => Array.from(g.getAttribute('position').array));
  const nor = parts.flatMap((g) => Array.from(g.getAttribute('normal').array));
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return merged;
}

export interface ShipToDraw {
  id: string;
  hue: number;
  state: ShipState;
}

export class ShipView {
  readonly group = new THREE.Group();
  private readonly geometry = createShipGeometry();
  private readonly meshes = new Map<string, THREE.Mesh>();
  private readonly lightPos = new Float32Array(MAX_SHIPS * 3);
  private readonly lightColor = new Float32Array(MAX_SHIPS * 3);
  private readonly lightPosAttr = new THREE.InstancedBufferAttribute(this.lightPos, 3);
  private readonly lightColorAttr = new THREE.InstancedBufferAttribute(this.lightColor, 3);
  private readonly lights: THREE.Sprite;
  private readonly quat = new THREE.Quaternion();
  private readonly color = new THREE.Color();

  constructor() {
    const m = new THREE.PointsNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: false,
    });
    this.lightPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.lightColorAttr.setUsage(THREE.DynamicDrawUsage);
    m.positionNode = instancedBufferAttribute(this.lightPosAttr, 'vec3');
    // ゆっくり点滅させる（飛行機の灯りのように）
    const blink = sin(time.mul(3)).mul(0.35).add(0.65);
    m.colorNode = instancedBufferAttribute<'vec3'>(this.lightColorAttr, 'vec3').mul(blink);
    m.sizeNode = float(LIGHT_SIZE_PX);
    const d = uv().sub(0.5).length().mul(2);
    m.opacityNode = exp(d.mul(d).mul(-8));
    this.lights = new THREE.Sprite(m);
    this.lights.count = 0;
    this.lights.frustumCulled = false;
    this.group.add(this.lights);
  }

  update(ships: readonly ShipToDraw[], date: Date, observerKm: Vec3): void {
    const seen = new Set<string>();
    const n = Math.min(ships.length, MAX_SHIPS);
    for (let i = 0; i < n; i++) {
      const ship = ships[i];
      seen.add(ship.id);
      let mesh = this.meshes.get(ship.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.geometry, new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0.3 }));
        this.meshes.set(ship.id, mesh);
        this.group.add(mesh);
      }
      this.color.setHSL(ship.hue / 360, 0.75, 0.6);
      (mesh.material as THREE.MeshStandardNodeMaterial).color.copy(this.color);
      const rel = sub(shipPositionKm(ship.state, date), observerKm);
      mesh.position.set(rel.x, rel.y, rel.z);
      const q = ship.state.orientation;
      mesh.quaternion.copy(this.quat.set(q.x, q.y, q.z, q.w));
      this.lightPos.set([rel.x, rel.y, rel.z], i * 3);
      this.lightColor.set([this.color.r, this.color.g, this.color.b], i * 3);
    }
    for (const [id, mesh] of this.meshes) {
      if (seen.has(id)) continue;
      this.group.remove(mesh);
      (mesh.material as THREE.Material).dispose();
      this.meshes.delete(id);
    }
    this.lights.count = n;
    this.lightPosAttr.needsUpdate = true;
    this.lightColorAttr.needsUpdate = true;
  }
}
