/**
 * 人工衛星を光の点として描く。地球のまわりの約 1,700 機（src/world/satellites.ts）。
 * 遠くからでも見えるよう、点の大きさは画面のピクセルで決める。地球から遠い（100 万 km より外）ときは描かない
 */
import * as THREE from 'three/webgpu';
import { exp, float, instancedBufferAttribute, uv, vec3 } from 'three/tsl';
import { satelliteSizeKm, type SatelliteCatalog } from '../world/satellites';
import type { Vec3 } from '../world/vec';

const HIDE_BEYOND_KM = 1e6;
const SIZE_PX = 5;

export class SatelliteField {
  readonly sprite: THREE.Sprite;
  private readonly pos: Float32Array;
  private readonly attr: THREE.InstancedBufferAttribute;

  constructor(private readonly catalog: SatelliteCatalog) {
    this.pos = new Float32Array(Math.max(1, catalog.count) * 3);
    this.attr = new THREE.InstancedBufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    const m = new THREE.PointsNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: false,
    });
    m.positionNode = instancedBufferAttribute(this.attr, 'vec3');
    m.sizeNode = float(SIZE_PX);
    m.colorNode = vec3(1.0, 0.92, 0.7).mul(0.9);
    const d = uv().sub(0.5).length().mul(2);
    m.opacityNode = exp(d.mul(d).mul(-8));
    this.sprite = new THREE.Sprite(m);
    this.sprite.count = 0;
    this.sprite.frustumCulled = false;
  }

  /** 1 ピクセルの大きさを決める値（画面の高さの半分 ÷ tan(視野の半分)） */
  pxPerRadian = 700;
  private sizes: Float32Array | null = null;

  /** earthRelKm は自分から見た地球の中心の位置（km・EQJ） */
  update(earthRelKm: Vec3): void {
    if (Math.hypot(earthRelKm.x, earthRelKm.y, earthRelKm.z) > HIDE_BEYOND_KM) {
      this.sprite.visible = false;
      return;
    }
    this.sprite.visible = true;
    const c = this.catalog;
    if (!this.sizes) this.sizes = Float32Array.from(c.records, (r) => satelliteSizeKm(r.name));
    let n = 0;
    for (let i = 0; i < c.count; i++) {
      if (!c.isOk(i)) continue;
      const o = i * 3;
      const x = earthRelKm.x + c.positions[o];
      const y = earthRelKm.y + c.positions[o + 1];
      const z = earthRelKm.z + c.positions[o + 2];
      // 本物の大きさが画面で 1.5 ピクセルより大きいなら、点は描かない（模型が見える。要件 F33）
      if ((this.sizes[i] / 2 / Math.max(Math.hypot(x, y, z), 1e-9)) * this.pxPerRadian > 1.5) continue;
      this.pos.set([x, y, z], n * 3);
      n++;
    }
    this.sprite.count = n;
    this.attr.clearUpdateRanges();
    this.attr.addUpdateRange(0, n * 3);
    this.attr.needsUpdate = true;
  }
}
