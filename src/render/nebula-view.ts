/**
 * 星雲を描く（docs/tech/nebulae.md）。星を描く場面（pc 単位）に置く。
 * - 遠く：本物の見かけの大きさの、ぼんやりした小さな光（画面で数ピクセルまで。要件 F32 のとおり、大きく広がった光にはしない）
 * - 大きく見えるもの：点の集まりで形を見せる。大きく見えている順に PARTICLE_NEBULAE 個
 * 暗黒星雲は光らず、後ろの星を隠す黒い点の集まりとしてだけ描く。
 */
import * as THREE from 'three/webgpu';
import { cameraPosition, clamp, exp, float, instancedBufferAttribute, min, smoothstep, uniform, uv } from 'three/tsl';
import { nebulaParticles, prominent, type Nebula, type NebulaParticles, type NebulaType } from '../world/nebulae';
import type { Vec3 } from '../world/vec';
import { starLimitMag } from './star-sprites';

/**
 * 星の見え方（要件 F34）で星雲の明るさを変える。星雲はほとんど肉眼では見えず、長い時間の写真で見えるものなので、
 * 肉眼（6.5 等）で 0.25 倍、双眼鏡（9 等）で 0.67 倍、写真（14 等）で 1 倍（見た目のための値）
 */
const exposure = () => clamp(starLimitMag.sub(5).div(6), float(0.1), float(1));

/** 形を点で見せる星雲の数と、1 つの点の数 */
const PARTICLE_NEBULAE = 6;
const PARTICLES = 6_000;
/** 半径 ÷ 距離がこれより小さい星雲は点を作らない（画面で 2 ピクセルくらい） */
const MIN_APPARENT = 0.003;
const CHECK_MS = 1_000;
const CACHE_SIZE = 64;

const GLOW_COLOR: Record<NebulaType, readonly [number, number, number]> = {
  hii: [1, 0.35, 0.4],
  pn: [0.4, 0.9, 0.85],
  snr: [0.95, 0.5, 0.45],
  rn: [0.5, 0.65, 1],
  dn: [0, 0, 0],
};
const GLOW_BRIGHTNESS: Record<NebulaType, number> = { hii: 0.32, pn: 0.3, snr: 0.25, rn: 0.2, dn: 0 };

export class NebulaView {
  readonly group = new THREE.Group();
  private readonly pxPerRadian = uniform(700);
  private readonly glow: THREE.Sprite;
  private readonly light: ParticleLayer;
  private readonly dark: ParticleLayer;
  private readonly cache = new Map<string, NebulaParticles>();
  private lastCheck = -Infinity;
  private shown = '';

  constructor(private readonly nebulae: readonly Nebula[]) {
    this.glow = this.createGlow();
    this.light = new ParticleLayer(PARTICLE_NEBULAE * PARTICLES, false, this.pxPerRadian);
    this.dark = new ParticleLayer(PARTICLE_NEBULAE * PARTICLES, true, this.pxPerRadian);
    this.group.add(this.glow, this.dark.sprite, this.light.sprite);
  }

  setViewport(heightPx: number, fovDeg: number): void {
    this.pxPerRadian.value = heightPx / 2 / Math.tan((fovDeg * Math.PI) / 360);
  }

  private createGlow(): THREE.Sprite {
    const list = this.nebulae.filter((n) => n.type !== 'dn');
    const n = Math.max(1, list.length);
    const pos = new Float32Array(n * 3);
    const radius = new Float32Array(n);
    const color = new Float32Array(n * 3);
    list.forEach((b, i) => {
      pos.set([b.positionPc.x, b.positionPc.y, b.positionPc.z], i * 3);
      radius[i] = b.radiusPc;
      const c = GLOW_COLOR[b.type];
      const k = GLOW_BRIGHTNESS[b.type];
      color.set([c[0] * k, c[1] * k, c[2] * k], i * 3);
    });
    const p = instancedBufferAttribute<'vec3'>(new THREE.InstancedBufferAttribute(pos, 3), 'vec3');
    const rPc = instancedBufferAttribute<'float'>(new THREE.InstancedBufferAttribute(radius, 1), 'float');
    const dist = p.sub(cameraPosition).length().max(1e-6);
    const px = rPc.div(dist).mul(this.pxPerRadian);
    const drawn = clamp(px.mul(2.4), float(2.5), float(16));
    // 小さく見えるものほど暗い（1 ピクセルの中に広がりが収まらない分）。大きく見えるものは点の集まりに任せて消す
    const small = min(px.mul(px).mul(0.6).add(0.02), float(1));
    const fadeBig = float(1).sub(smoothstep(3, 7, px));
    const m = new THREE.PointsNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false });
    m.positionNode = p;
    m.sizeNode = drawn;
    m.colorNode = instancedBufferAttribute<'vec3'>(new THREE.InstancedBufferAttribute(color, 3), 'vec3').mul(small).mul(fadeBig).mul(exposure());
    const d = uv().sub(0.5).length().mul(2);
    m.opacityNode = exp(d.mul(d).mul(-5));
    const s = new THREE.Sprite(m);
    s.count = list.length;
    s.frustumCulled = false;
    return s;
  }

  update(cameraPc: Vec3, nowMs: number): void {
    if (nowMs - this.lastCheck < CHECK_MS) return;
    this.lastCheck = nowMs;
    const list = prominent(this.nebulae, cameraPc, PARTICLE_NEBULAE, MIN_APPARENT);
    const key = list.map((n) => n.name).join('|');
    if (key === this.shown) return;
    this.shown = key;
    this.light.set(list.filter((n) => n.type !== 'dn').map((n) => [n, this.particles(n)]));
    this.dark.set(list.filter((n) => n.type === 'dn').map((n) => [n, this.particles(n)]));
  }

  private particles(n: Nebula): NebulaParticles {
    let p = this.cache.get(n.name);
    if (!p) {
      p = nebulaParticles(n, PARTICLES);
      this.cache.set(n.name, p);
      if (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value as string);
    }
    return p;
  }
}

/** 星雲の形の点の集まり。1 つの点の大きさと明るさは、星雲の見かけの大きさから決める */
class ParticleLayer {
  readonly sprite: THREE.Sprite;
  private readonly pos: Float32Array;
  private readonly color: Float32Array;
  private readonly radius: Float32Array;
  private readonly attrs: THREE.InstancedBufferAttribute[];

  constructor(capacity: number, dark: boolean, pxPerRadian: ReturnType<typeof uniform>) {
    this.pos = new Float32Array(capacity * 3);
    this.color = new Float32Array(capacity * 3);
    this.radius = new Float32Array(capacity);
    const posAttr = new THREE.InstancedBufferAttribute(this.pos, 3);
    const colorAttr = new THREE.InstancedBufferAttribute(this.color, 3);
    const radiusAttr = new THREE.InstancedBufferAttribute(this.radius, 1);
    this.attrs = [posAttr, colorAttr, radiusAttr];
    for (const a of this.attrs) a.setUsage(THREE.DynamicDrawUsage);
    const p = instancedBufferAttribute<'vec3'>(posAttr, 'vec3');
    const rPc = instancedBufferAttribute<'float'>(radiusAttr, 'float');
    const dist = p.sub(cameraPosition).length().max(1e-6);
    const apparent = rPc.div(dist).mul(pxPerRadian as unknown as ReturnType<typeof float>);
    // 点の大きさは星雲の見かけの大きさの 12% ほど。点を重ねて、雲の濃淡に見せる（1 つずつの点には見えないように）
    const size = clamp(apparent.mul(0.12), float(1.6), float(dark ? 60 : 44));
    // 点が大きいほど重なるので、1 つの点を暗くする。見かけが小さいうちは重なりが増えるので、さらに暗い
    const k = clamp(apparent.mul(apparent).mul(3.14).div(PARTICLES).div(size.mul(size)).mul(dark ? 6 : 0.38), float(0.002), float(dark ? 0.9 : 0.05));
    const fadeIn = smoothstep(1.5, 5, apparent);
    const m = new THREE.PointsNodeMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending,
      sizeAttenuation: false,
    });
    m.positionNode = p;
    m.sizeNode = size.mul(2);
    m.colorNode = instancedBufferAttribute<'vec3'>(colorAttr, 'vec3').mul(dark ? float(1) : k.mul(fadeIn).mul(exposure()));
    const d = uv().sub(0.5).length().mul(2);
    const shape = exp(d.mul(d).mul(-6));
    m.opacityNode = dark ? shape.mul(k.mul(fadeIn).mul(0.5)) : shape;
    this.sprite = new THREE.Sprite(m);
    this.sprite.count = 0;
    this.sprite.frustumCulled = false;
  }

  set(list: readonly [Nebula, NebulaParticles][]): void {
    let n = 0;
    for (const [neb, p] of list) {
      this.pos.set(p.positions.subarray(0, p.count * 3), n * 3);
      this.color.set(p.colors.subarray(0, p.count * 3), n * 3);
      this.radius.fill(neb.radiusPc, n, n + p.count);
      n += p.count;
    }
    this.sprite.count = n;
    for (const a of this.attrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }
}
