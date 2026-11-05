/**
 * 小惑星を光の点として描く（要件 F21）。
 *
 * 番号の付いた小惑星（約 90 万個）の軌道要素を GPU に渡し、毎フレーム頂点シェーダーでケプラーの方程式を解いて位置を出す。
 * CPU で毎フレーム 90 万個を計算するのは重すぎるため。GPU の 32bit の計算なので位置の誤差は数千 km あるが、
 * 光の点としては見分けられない（近くで見る大きな天体は、球として src/world/small-bodies.ts で倍精度で計算する）。
 * データは public/data/asteroids-*.bin（tools/build-asteroids.mjs）。スマホは明るい約 7.6 万個だけ読む。
 */
import * as THREE from 'three/webgpu';
import {
  clamp,
  cos,
  exp,
  float,
  floor,
  instancedBufferAttribute,
  log,
  max,
  sin,
  smoothstep,
  sqrt,
  uniform,
  uv,
  vec3,
} from 'three/tsl';
import { OBLIQUITY_J2000 } from '../world/small-bodies';
import { KM_PER_AU } from '../world/units';
import type { Vec3 } from '../world/vec';
import type UniformNode from 'three/src/nodes/core/UniformNode.js';

const STRIDE = 9;
/** ガウスの引力定数 k（rad/日。太陽のまわりの平均運動 n = k / a^1.5、a は AU） */
const GAUSS_K = 0.01720209895;
/** これより太陽から遠く（AU）にいるときは描かない（太陽系の外では見えないので） */
const HIDE_BEYOND_AU = 2_000;
/** 見た目の決め方の数（見た目のための値） */
const LOOK = { refMag: 9, minIntensity: 0.08, fadeStartMag: 22, fadeEndMag: 30, sizePx: 2.2 };

export interface AsteroidFile {
  name: string;
  count: number;
  maxH: number;
}

class AsteroidChunk {
  readonly sprite: THREE.Sprite;

  constructor(data: Float32Array, days: UniformNode<'float', number>, observerAu: UniformNode<'vec3', THREE.Vector3>) {
    const n = data.length / STRIDE;
    const elA = new Float32Array(n * 4); // a, e, i, node
    const elB = new Float32Array(n * 4); // periapsis, M0, epoch（J2000 からの日）, H
    for (let k = 0; k < n; k++) {
      const o = k * STRIDE;
      elA.set([data[o + 2], data[o + 3], data[o + 4], data[o + 5]], k * 4);
      elB.set([data[o + 6], data[o + 7], data[o + 8], data[o + 1]], k * 4);
    }
    const A = instancedBufferAttribute<'vec4'>(new THREE.InstancedBufferAttribute(elA, 4), 'vec4');
    const B = instancedBufferAttribute<'vec4'>(new THREE.InstancedBufferAttribute(elB, 4), 'vec4');
    const a = A.x;
    const e = A.y;
    const inc = A.z;
    const node = A.w;
    const peri = B.x;
    const H = B.w;
    const meanMotion = float(GAUSS_K).div(a.mul(sqrt(a)));
    const M0 = B.y.add(meanMotion.mul(days.sub(B.z)));
    const twoPi = 2 * Math.PI;
    const M = M0.sub(floor(M0.div(twoPi)).mul(twoPi));
    // ケプラーの方程式をニュートン法で解く（6 回。離心率 0.9 くらいまで十分に収束する）
    let E = M.add(e.mul(sin(M)));
    for (let k = 0; k < 6; k++) E = E.sub(E.sub(e.mul(sin(E))).sub(M).div(float(1).sub(e.mul(cos(E)))));
    const xp = a.mul(cos(E).sub(e));
    const yp = a.mul(sqrt(float(1).sub(e.mul(e)))).mul(sin(E));
    const cO = cos(node);
    const sO = sin(node);
    const cw = cos(peri);
    const sw = sin(peri);
    const ci = cos(inc);
    const si = sin(inc);
    // 軌道の面 → 黄道座標（AU）
    const x = xp.mul(cO.mul(cw).sub(sO.mul(sw).mul(ci))).sub(yp.mul(cO.mul(sw).add(sO.mul(cw).mul(ci))));
    const y = xp.mul(sO.mul(cw).add(cO.mul(sw).mul(ci))).sub(yp.mul(sO.mul(sw).sub(cO.mul(cw).mul(ci))));
    const z = xp.mul(sw.mul(si)).add(yp.mul(cw.mul(si)));
    // 黄道座標 → EQJ
    const ce = Math.cos(OBLIQUITY_J2000);
    const se = Math.sin(OBLIQUITY_J2000);
    const helio = vec3(x, y.mul(ce).sub(z.mul(se)), y.mul(se).add(z.mul(ce)));
    const rel = helio.sub(observerAu);
    // 見かけの等級 m = H + 5·log10(r·Δ)（位相による暗さは無視）
    const r = max(helio.length(), float(1e-6));
    const delta = max(rel.length(), float(1e-9));
    const mag = H.add(log(r.mul(delta)).mul(5 / Math.LN10));
    // 自分のすぐ近く（20 万 km 以内）の点は消す。近くの小惑星は球として倍精度で描くので、
    // 32bit の計算でずれた点が球の横に見えないように
    const nearFade = smoothstep(5e4 / KM_PER_AU, 2e5 / KM_PER_AU, delta);
    const fade = float(1).sub(smoothstep(LOOK.fadeStartMag, LOOK.fadeEndMag, mag)).mul(nearFade);
    const intensity = clamp(exp(mag.sub(LOOK.refMag).mul(-0.4 * Math.LN10)), LOOK.minIntensity, 1).mul(fade);

    const material = new THREE.PointsNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: false,
    });
    material.positionNode = rel.mul(KM_PER_AU);
    material.sizeNode = float(LOOK.sizePx);
    material.colorNode = vec3(0.85, 0.8, 0.72).mul(intensity);
    const d = uv().sub(0.5).length().mul(2);
    material.opacityNode = exp(d.mul(d).mul(-6));
    this.sprite = new THREE.Sprite(material);
    this.sprite.count = n;
    this.sprite.frustumCulled = false;
  }
}

export class AsteroidField {
  readonly group = new THREE.Group();
  /** 読み込んだデータ（近くの小惑星を探すのに使う。src/world/asteroid-search.ts） */
  readonly chunks: Float32Array[] = [];
  private readonly days = uniform(0) as UniformNode<'float', number>;
  private readonly observerAu = uniform(new THREE.Vector3()) as UniformNode<'vec3', THREE.Vector3>;

  /** files を順に読み込んで足していく（読み込みは裏で行い、終わったものから描く） */
  async load(files: readonly AsteroidFile[], onProgress?: (loaded: number) => void): Promise<void> {
    let loaded = 0;
    for (const f of files) {
      const r = await fetch(`/data/${f.name}`);
      if (!r.ok) throw new Error(`小惑星のデータが読めない: ${f.name}`);
      const data = new Float32Array(await r.arrayBuffer());
      this.chunks.push(data);
      const chunk = new AsteroidChunk(data, this.days, this.observerAu);
      this.group.add(chunk.sprite);
      loaded += f.count;
      onProgress?.(loaded);
    }
  }

  update(date: Date, observerKm: Vec3): void {
    this.days.value = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
    const au = { x: observerKm.x / KM_PER_AU, y: observerKm.y / KM_PER_AU, z: observerKm.z / KM_PER_AU };
    this.observerAu.value.set(au.x, au.y, au.z);
    this.group.visible = Math.hypot(au.x, au.y, au.z) < HIDE_BEYOND_AU;
  }
}
