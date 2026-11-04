/**
 * 星を描く部品。本物の星（HYG）にも、自動で作った星（銀河のモデル）にも使う。
 *
 * - 星ごとに絶対等級を持ち、カメラからの距離で見かけの明るさを GPU で毎フレーム計算する
 *   （遠くへ行くと地球から見た星空ではなくなる。近づいた星は明るくなる）
 * - 見た目の決め方の数は src/world/stars.ts の STAR_LOOK（CPU の starAppearance と同じ式）
 * - WebGPU は点を 1 ピクセルでしか描けないので、小さな板（Sprite）を星の数だけまとめて描く
 */
import * as THREE from 'three/webgpu';
import { cameraPosition, clamp, exp, float, instancedBufferAttribute, log, max, smoothstep, uv } from 'three/tsl';
import { bvToRgb, STAR_LOOK } from '../world/stars';

/** 板の大きさは、見せたい大きさの何倍か。ふちに向かってぼかすので、その分大きく取る */
const GLOW_SCALE = 3;
const LN10 = Math.LN10;

export class StarSprites {
  readonly sprite: THREE.Sprite;
  private readonly position: Float32Array;
  private readonly absMag: Float32Array;
  private readonly color: Float32Array;
  private readonly attrs: THREE.InstancedBufferAttribute[];

  constructor(readonly capacity: number) {
    this.position = new Float32Array(capacity * 3);
    this.absMag = new Float32Array(capacity);
    this.color = new Float32Array(capacity * 3);
    const posAttr = new THREE.InstancedBufferAttribute(this.position, 3);
    const magAttr = new THREE.InstancedBufferAttribute(this.absMag, 1);
    const colorAttr = new THREE.InstancedBufferAttribute(this.color, 3);
    this.attrs = [posAttr, magAttr, colorAttr];
    for (const a of this.attrs) a.setUsage(THREE.DynamicDrawUsage);

    const L = STAR_LOOK;
    const pos = instancedBufferAttribute<'vec3'>(posAttr, 'vec3');
    const distancePc = max(pos.sub(cameraPosition).length(), float(1e-7));
    // m = M + 5·log10(d / 10)
    const mag = instancedBufferAttribute<'float'>(magAttr, 'float').add(log(distancePc.div(10)).mul(5 / LN10));
    const fade = float(1).sub(smoothstep(L.fadeStartMag, L.fadeEndMag, mag));
    const intensity = clamp(exp(mag.sub(L.refMag).mul(-0.4 * L.contrast * LN10)), L.minIntensity, 1).mul(fade);
    const size = clamp(exp(mag.add(L.sizeOffsetMag).mul(-L.sizeSlope * LN10)).mul(L.sizeBasePx), L.minSizePx, L.maxSizePx);

    const material = new THREE.PointsNodeMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: false,
    });
    material.positionNode = pos;
    material.sizeNode = size.mul(GLOW_SCALE);
    material.colorNode = instancedBufferAttribute<'vec3'>(colorAttr, 'vec3').mul(intensity);
    const d = uv().sub(0.5).length().mul(2);
    material.opacityNode = exp(d.mul(d).mul(-8));

    this.sprite = new THREE.Sprite(material);
    this.sprite.count = 0;
    this.sprite.frustumCulled = false;
  }

  /** 星を入れ替える。i 番目の星は x・y・z（pc）、絶対等級、色指数 B−V */
  set(count: number, get: (i: number) => { x: number; y: number; z: number; absMag: number; bv: number }): void {
    const n = Math.min(count, this.capacity);
    for (let i = 0; i < n; i++) {
      const s = get(i);
      this.position[i * 3] = s.x;
      this.position[i * 3 + 1] = s.y;
      this.position[i * 3 + 2] = s.z;
      this.absMag[i] = s.absMag;
      const [r, g, b] = bvToRgb(s.bv);
      this.color.set([r, g, b], i * 3);
    }
    this.sprite.count = n;
    for (const a of this.attrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }
}
