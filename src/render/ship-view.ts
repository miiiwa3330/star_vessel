/**
 * 他のプレイヤーの宇宙船を描く（要件 F15・F16）。
 *
 * - 船は本物に近い大きさ（全長 40 m）。遠くでは見えないので、航行灯（いつも数ピクセルの光の点）を付ける
 * - 色はプレイヤーごと（サーバーが決める色相）
 * - 形はプレイヤーが選んだ船（src/render/ship-models.ts。要件 F27）。選んでいない人は id から決める。
 *   自分で作った船は、印（ref）からブロックを読む（blocksFor）。読めるまでは、id から決めた船で描く
 * - 自分の船も同じ形で描く（三人称の視点のとき。原点に置く）
 */
import * as THREE from 'three/webgpu';
import { float, instancedBufferAttribute, sin, time, uv, exp } from 'three/tsl';
import type { Block } from '../world/ship-blocks';
import { defaultHullFor, type ShipLook } from '../world/ship-design';
import type { Quat } from '../world/quat';
import { createShipModel, customKey, presetShape, WORLD_SELF_LIGHT, type ShipModel, type ShipShape } from './ship-models';
import { sub, type Vec3 } from '../world/vec';
import { trailStrength, VaporTrail } from './vapor-trail';

const MAX_SHIPS = 64;
/** 航行灯の大きさ（CSS ピクセル）。ふちをぼかすので、見える大きさはこの 1/3 くらい */
const LIGHT_SIZE_PX = 14;

export interface ShipToDraw {
  id: string;
  hue: number;
  /** 太陽中心の位置（km・EQJ） */
  positionKm: Vec3;
  orientation: Quat;
  /** 船の見た目の印（無ければ id から決める） */
  design?: ShipLook;
  /** 速度（km/s）。ベイパー（動いたときの尾）に使う */
  velocityKmS?: Vec3;
}

interface Drawn {
  model: ShipModel;
  /** 形の名前（ship-models.ts の presetKey・customKey） */
  key: string;
  trail: VaporTrail;
  /** これまでに見たいちばん速い速さ（km/s）。他の船は速さの設定が届かないので、これを「全速」とみなす */
  topSpeed: number;
}

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

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

  /** blocksFor：自分で作った船の印から、ブロックを読む（まだ読めていなければ null） */
  constructor(private readonly blocksFor: (ref: string) => readonly Block[] | null = () => null) {
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

  /** 船の見た目の印から、描く形。自分で作った船のブロックが読めるまでは、id から決めた船 */
  shapeOf(look: ShipLook | undefined, id: string): ShipShape {
    if (look && 'ref' in look) {
      const blocks = this.blocksFor(look.ref);
      if (blocks) return { key: customKey(look.ref), blocks };
    }
    return presetShape(look && 'hull' in look ? look.hull : defaultHullFor(id));
  }

  private ensure(current: Drawn | undefined | null, shape: ShipShape): Drawn {
    if (current && current.key === shape.key) return current;
    if (current) {
      this.group.remove(current.model.group);
      current.model.dispose();
    }
    const trail = current?.trail ?? new VaporTrail();
    const d = { model: createShipModel(shape, WORLD_SELF_LIGHT), key: shape.key, trail, topSpeed: current?.topSpeed ?? 0 };
    this.group.add(d.model.group);
    if (!current) this.group.add(trail.mesh);
    return d;
  }

  /** 自分の船（三人称の視点のときだけ見せる）。自分は原点にいる */
  setOwn(visible: boolean, shape: ShipShape, orientation: Quat, velocityKmS: Vec3 = ZERO, fullSpeedKmS = 0, dt = 0): void {
    if (!visible) {
      if (this.own) {
        this.own.model.group.visible = false;
        this.own.trail.mesh.visible = false;
      }
      return;
    }
    this.own = this.ensure(this.own, shape);
    const speed = Math.hypot(velocityKmS.x, velocityKmS.y, velocityKmS.z);
    this.own.trail.update(ZERO, velocityKmS, trailStrength(speed, fullSpeedKmS), this.own.model.lengthKm, dt);
    const g = this.own.model.group;
    g.visible = true;
    g.position.set(0, 0, 0);
    g.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);
  }

  /** 描いている船の大きさ（km）。まだ描いていなければ null（チャットの吹き出しの高さに使う） */
  lengthKmOf(id: string): number | null {
    return this.drawn.get(id)?.model.lengthKm ?? null;
  }

  /** 1 ピクセルの大きさを決める値（画面の高さの半分 ÷ tan(視野の半分)） */
  pxPerRadian = 700;

  update(ships: readonly ShipToDraw[], observerKm: Vec3, dt = 0): void {
    const seen = new Set<string>();
    const n = Math.min(ships.length, MAX_SHIPS);
    for (let i = 0; i < n; i++) {
      const ship = ships[i];
      seen.add(ship.id);
      const d = this.ensure(this.drawn.get(ship.id), this.shapeOf(ship.design, ship.id));
      const lengthKm = d.model.lengthKm;
      this.drawn.set(ship.id, d);
      const rel = sub(ship.positionKm, observerKm);
      const g = d.model.group;
      g.position.set(rel.x, rel.y, rel.z);
      const q = ship.orientation;
      g.quaternion.copy(this.quat.set(q.x, q.y, q.z, q.w));
      const v = ship.velocityKmS ?? ZERO;
      const speed = Math.hypot(v.x, v.y, v.z);
      d.topSpeed = Math.max(d.topSpeed, speed);
      d.trail.update(rel, v, trailStrength(speed, d.topSpeed), lengthKm, dt);
      this.color.setHSL(ship.hue / 360, 0.75, 0.6);
      // 船が画面で 3 ピクセルより大きく見えるなら、航行灯の点は消す（船の模型が見える。要件 F33）
      const px = (lengthKm / 2 / Math.max(Math.hypot(rel.x, rel.y, rel.z), 1e-9)) * this.pxPerRadian;
      const k = Math.max(0, Math.min(1, (3 - px) / 1.5));
      this.lightPos.set([rel.x, rel.y, rel.z], i * 3);
      this.lightColor.set([this.color.r * k, this.color.g * k, this.color.b * k], i * 3);
    }
    for (const [id, d] of this.drawn) {
      if (seen.has(id)) continue;
      this.group.remove(d.model.group, d.trail.mesh);
      d.model.dispose();
      d.trail.dispose();
      this.drawn.delete(id);
    }
    this.lights.count = n;
    this.lightPosAttr.needsUpdate = true;
    this.lightColorAttr.needsUpdate = true;
  }
}
