/**
 * 彗星を光の点として描く（約 4,000 個）。位置は倍精度で計算して、自分からの相対位置を GPU に渡す。
 * すべてを毎フレーム解くと重いので、毎フレーム 60 分の 1 だけ解き直し、間は速度で進める（止めておくと、近くで見たときに 1 秒ごとに飛ぶ）。
 * 明るさは全光度の式 m = M1 + 5·log10(Δ) + K1·log10(r)。太陽の近くの彗星は天体の一覧に入れて、核と尾も描く（src/render/solar-system-view.ts）
 */
import * as THREE from 'three/webgpu';
import { exp, float, instancedBufferAttribute, uv } from 'three/tsl';
import { cometMotionKm, type Comet } from '../world/comets';
import { KM_PER_AU } from '../world/units';
import type { Vec3 } from '../world/vec';

const SIZE_PX = 4;
const BATCHES = 60;
/** 太陽からこの距離より遠いときは描かない */
const HIDE_BEYOND_AU = 2_000;
/** 全光度の式が分からない彗星の値 */
const DEFAULT = { m1: 14, k1: 10 };

export class CometField {
  readonly sprite: THREE.Sprite;
  private readonly abs: Float64Array;
  /** abs の時刻の速度（km/s）と、その時刻（ms） */
  private readonly vel: Float64Array;
  private readonly at: Float64Array;
  private readonly pos: Float32Array;
  private readonly color: Float32Array;
  private readonly posAttr: THREE.InstancedBufferAttribute;
  private readonly colorAttr: THREE.InstancedBufferAttribute;
  private cursor = 0;
  private started = false;

  constructor(private readonly comets: readonly Comet[]) {
    const n = Math.max(1, comets.length);
    this.abs = new Float64Array(n * 3);
    this.vel = new Float64Array(n * 3);
    this.at = new Float64Array(n);
    this.pos = new Float32Array(n * 3);
    this.color = new Float32Array(n * 3);
    this.posAttr = new THREE.InstancedBufferAttribute(this.pos, 3);
    this.colorAttr = new THREE.InstancedBufferAttribute(this.color, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    const m = new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false });
    m.positionNode = instancedBufferAttribute(this.posAttr, 'vec3');
    m.colorNode = instancedBufferAttribute<'vec3'>(this.colorAttr, 'vec3');
    m.sizeNode = float(SIZE_PX);
    const d = uv().sub(0.5).length().mul(2);
    m.opacityNode = exp(d.mul(d).mul(-12));
    this.sprite = new THREE.Sprite(m);
    this.sprite.count = comets.length;
    this.sprite.frustumCulled = false;
  }

  private refresh(i: number, date: Date, observerKm: Vec3): void {
    const c = this.comets[i];
    const { p, v } = cometMotionKm(c, date);
    this.abs[i * 3] = p.x;
    this.abs[i * 3 + 1] = p.y;
    this.abs[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x;
    this.vel[i * 3 + 1] = v.y;
    this.vel[i * 3 + 2] = v.z;
    this.at[i] = date.getTime();
    const r = Math.max(Math.hypot(p.x, p.y, p.z) / KM_PER_AU, 0.01);
    const delta = Math.max(Math.hypot(p.x - observerKm.x, p.y - observerKm.y, p.z - observerKm.z) / KM_PER_AU, 1e-5);
    const mag = (c.m1 ?? DEFAULT.m1) + 5 * Math.log10(delta) + (c.k1 ?? DEFAULT.k1) * Math.log10(r);
    // 暗くても探しに行けるように、うっすら残す（小惑星と同じ考え方）
    const b = Math.min(1, Math.max(0.06, 10 ** (-0.4 * (mag - 3) * 0.6)));
    this.color[i * 3] = 0.7 * b;
    this.color[i * 3 + 1] = 0.95 * b;
    this.color[i * 3 + 2] = 1 * b;
  }

  update(date: Date, observerKm: Vec3): void {
    const n = this.comets.length;
    if (n === 0) return;
    if (Math.hypot(observerKm.x, observerKm.y, observerKm.z) > HIDE_BEYOND_AU * KM_PER_AU) {
      this.sprite.visible = false;
      // 戻ってきたときは全部を解き直す（速度で長く進めると、ずれるので）
      this.started = false;
      return;
    }
    this.sprite.visible = true;
    if (!this.started) {
      for (let i = 0; i < n; i++) this.refresh(i, date, observerKm);
      this.started = true;
    } else {
      const step = Math.ceil(n / BATCHES);
      for (let k = 0; k < step; k++) {
        this.refresh(this.cursor, date, observerKm);
        this.cursor = (this.cursor + 1) % n;
      }
    }
    const t = date.getTime();
    for (let k = 0; k < n; k++) {
      const i = k * 3;
      const s = (t - this.at[k]) / 1000;
      this.pos[i] = this.abs[i] + this.vel[i] * s - observerKm.x;
      this.pos[i + 1] = this.abs[i + 1] + this.vel[i + 1] * s - observerKm.y;
      this.pos[i + 2] = this.abs[i + 2] + this.vel[i + 2] * s - observerKm.z;
    }
    this.posAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }
}
