/**
 * 他のプレイヤーの宇宙船を描く（要件 F15・F16）。
 *
 * - 船は本物に近い大きさ（全長 40 m）。遠くでは見えないので、航行灯（いつも数ピクセルの光の点）を付ける
 * - 色はプレイヤーごと（サーバーが決める色相）
 * - 形はプレイヤーが選んだ船体（src/render/ship-models.ts。要件 F27）。選んでいない人は id から決める
 * - 自分の船も同じ形で描く（三人称の視点のとき。原点に置く）
 */
import * as THREE from 'three/webgpu';
import { float, instancedBufferAttribute, sin, time, uv, exp } from 'three/tsl';
import { shipPositionKm } from '../world/ships';
import type { ShipState } from '../world/ship-schema';
import { defaultDesignFor, type HullType, type ShipDesign } from '../world/ship-design';
import type { Quat } from '../world/quat';
import { createShipModel, type ShipModel } from './ship-models';
import { sub, type Vec3 } from '../world/vec';

const MAX_SHIPS = 64;
/** 航行灯の大きさ（CSS ピクセル）。ふちをぼかすので、見える大きさはこの 1/3 くらい */
const LIGHT_SIZE_PX = 14;

export interface ShipToDraw {
  id: string;
  hue: number;
  state: ShipState;
  /** 船の設計（無ければ id から決める） */
  design?: ShipDesign;
}

interface Drawn {
  model: ShipModel;
  hull: HullType;
}

export class ShipView {
  readonly group = new THREE.Group();
  private readonly drawn = new Map<string, Drawn>();
  private own: Drawn | null = null;
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

  private ensure(current: Drawn | undefined | null, hull: HullType, hue: number): Drawn {
    if (current && current.hull === hull) {
      current.model.setHue(hue);
      return current;
    }
    if (current) {
      this.group.remove(current.model.group);
      current.model.dispose();
    }
    const d = { model: createShipModel(hull, hue), hull };
    this.group.add(d.model.group);
    return d;
  }

  /** 自分の船（三人称の視点のときだけ見せる）。自分は原点にいる */
  setOwn(visible: boolean, design: ShipDesign, hue: number, orientation: Quat): void {
    if (!visible) {
      if (this.own) this.own.model.group.visible = false;
      return;
    }
    this.own = this.ensure(this.own, design.hull, hue);
    const g = this.own.model.group;
    g.visible = true;
    g.position.set(0, 0, 0);
    g.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);
  }

  update(ships: readonly ShipToDraw[], date: Date, observerKm: Vec3): void {
    const seen = new Set<string>();
    const n = Math.min(ships.length, MAX_SHIPS);
    for (let i = 0; i < n; i++) {
      const ship = ships[i];
      seen.add(ship.id);
      const hull = (ship.design ?? defaultDesignFor(ship.id)).hull;
      const d = this.ensure(this.drawn.get(ship.id), hull, ship.hue);
      this.drawn.set(ship.id, d);
      const rel = sub(shipPositionKm(ship.state, date), observerKm);
      const g = d.model.group;
      g.position.set(rel.x, rel.y, rel.z);
      const q = ship.state.orientation;
      g.quaternion.copy(this.quat.set(q.x, q.y, q.z, q.w));
      this.color.setHSL(ship.hue / 360, 0.75, 0.6);
      this.lightPos.set([rel.x, rel.y, rel.z], i * 3);
      this.lightColor.set([this.color.r, this.color.g, this.color.b], i * 3);
    }
    for (const [id, d] of this.drawn) {
      if (seen.has(id)) continue;
      this.group.remove(d.model.group);
      d.model.dispose();
      this.drawn.delete(id);
    }
    this.lights.count = n;
    this.lightPosAttr.needsUpdate = true;
    this.lightColorAttr.needsUpdate = true;
  }
}
