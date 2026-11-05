/**
 * 星団を描く（docs/tech/clusters.md）。星を描く場面（pc 単位）に置く。
 * - 星団全体の光：星団の大きさ（半数半径）に合わせて広がる、ぼんやりした光（約 7,000）。遠くでは小さな光の点、
 *   近づくと大きな光の玉になる。全体の明るさは、星団の星を合わせた絶対等級（clusterAbsMag）から距離で決める
 * - 近づくと、メンバーの星を作って描く（近い順に最大 3 つの星団）
 */
import * as THREE from 'three/webgpu';
import { cameraPosition, clamp, exp, float, instancedBufferAttribute, log, min, smoothstep, uniform, uv } from 'three/tsl';
import { clusterAbsMag, clusterStars, MAX_MEMBERS, nearbyClusters, readRealMembers, type Cluster, type ClusterStar } from '../world/clusters';
import { bvToRgb } from '../world/stars';
import type { Vec3 } from '../world/vec';
import { StarSprites } from './star-sprites';

/** 光の広がりの大きさ（半数半径の何倍か）と、描く大きさの上限（ピクセル） */
const GLOW_RADII = 2.5;
const GLOW_MAX_PX = 1500;

const NEAR_CLUSTERS = 3;
const CHECK_MS = 1_000;

export class ClusterView {
  readonly group = new THREE.Group();
  private readonly glow: THREE.Sprite;
  /** 1 ピクセルの大きさを決める値（画面の高さの半分 ÷ tan(視野の半分)）。画面の大きさが変わったら直す */
  private readonly pxPerRadian = uniform(700);
  private readonly members = new StarSprites(MAX_MEMBERS.globular * NEAR_CLUSTERS);
  private shown = '';
  private lastCheck = -Infinity;
  /** 本物のメンバーの星の目次と、読んだファイル（src/world/clusters.ts の readRealMembers） */
  private index: Record<string, [number, number, number]> | null = null;
  private readonly shards = new Map<number, Promise<Float32Array | null>>();

  constructor(private readonly clusters: readonly Cluster[]) {
    this.glow = this.createGlow();
    this.group.add(this.glow, this.members.sprite);
  }

  private createGlow(): THREE.Sprite {
    const n = Math.max(1, this.clusters.length);
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const mag = new Float32Array(n);
    const rich = new Float32Array(n);
    const crowded = new Float32Array(n);
    const color = new Float32Array(n * 3);
    this.clusters.forEach((c, i) => {
      pos.set([c.positionPc.x, c.positionPc.y, c.positionPc.z], i * 3);
      size[i] = c.r50Pc * GLOW_RADII * 2;
      mag[i] = clusterAbsMag(c);
      // メンバーの少ない星団は、広がった光を暗くする（空一面にぼんやりした塊が並ばないように。2,000 個で最大）
      rich[i] = Math.min(1, c.members / 2_000);
      // メンバーがとても多い星団（5,000 個以上。大きな球状星団）は、作るメンバー（上限 4,000）では星の多さが出ないので、近くでも光を残す
      crowded[i] = c.members >= 5_000 ? 1 : 0;
      // 球状星団は年老いた赤みのある星が多いので、色を少し赤く（見た目のための値）
      color.set(bvToRgb(c.kind === 'globular' ? 0.9 : 0.4), i * 3);
    });
    const p = instancedBufferAttribute<'vec3'>(new THREE.InstancedBufferAttribute(pos, 3), 'vec3');
    const sizePc = instancedBufferAttribute<'float'>(new THREE.InstancedBufferAttribute(size, 1), 'float');
    const absMag = instancedBufferAttribute<'float'>(new THREE.InstancedBufferAttribute(mag, 1), 'float');
    const dist = p.sub(cameraPosition).length().max(1e-6);
    const sizePx = sizePc.div(dist).mul(this.pxPerRadian);
    const drawnPx = clamp(sizePx, float(3), float(GLOW_MAX_PX));
    // 見かけの等級から全体の明るさ（星の見た目と同じく、差を少し縮める）。広がった分だけ 1 ピクセルあたりは暗くする
    const m = absMag.add(log(dist.div(10)).mul(5 / Math.LN10));
    // 2026-11-05：広がりの面積に比べて暗くしすぎると、1,500 pc のオメガ星団が見えなかったので、ゆるめた（見た目のための値）
    const total = clamp(exp(m.sub(3).mul(-0.4 * 0.7 * Math.LN10)), 0, 3);
    const richness = instancedBufferAttribute<'float'>(new THREE.InstancedBufferAttribute(rich, 1), 'float');
    const isCrowded = instancedBufferAttribute<'float'>(new THREE.InstancedBufferAttribute(crowded, 1), 'float');
    // 光の広がりは、星が 1 つずつに分かれて見えない遠くの星団（300〜1,000 pc より先）のためのもの。近い星団は星だけで見せる
    const unresolved = smoothstep(300, 1000, dist).max(isCrowded);
    const perPixel = min(total.mul(float(8).div(drawnPx).min(1).pow(0.7)), richness.mul(0.5));
    const material = new THREE.PointsNodeMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: false,
    });
    material.positionNode = p;
    material.sizeNode = drawnPx;
    // 星団の中（半数半径より内側）では光の玉を消し、メンバーの星に任せる
    const inside = smoothstep(sizePc.mul(0.2), sizePc.mul(0.6), dist);
    material.colorNode = instancedBufferAttribute<'vec3'>(new THREE.InstancedBufferAttribute(color, 3), 'vec3')
      .mul(perPixel)
      .mul(inside)
      .mul(unresolved);
    const d = uv().sub(0.5).length().mul(2);
    material.opacityNode = exp(d.mul(d).mul(-5));
    const sprite = new THREE.Sprite(material);
    sprite.count = this.clusters.length;
    sprite.frustumCulled = false;
    return sprite;
  }

  setViewport(heightPx: number, fovDeg: number): void {
    this.pxPerRadian.value = heightPx / 2 / Math.tan((fovDeg * Math.PI) / 360);
  }

  update(cameraPc: Vec3, nowMs: number): void {
    if (nowMs - this.lastCheck < CHECK_MS) return;
    this.lastCheck = nowMs;
    const near = nearbyClusters(this.clusters, cameraPc, NEAR_CLUSTERS);
    const key = near.map((c) => c.name).join('|');
    if (key === this.shown) return;
    this.shown = key;
    void this.showMembers(near, key);
  }

  /** メンバーの星を入れ替える。本物のメンバーのデータが読めなければ、数と大きさに合わせて作った星を使う */
  private async showMembers(near: readonly Cluster[], key: string): Promise<void> {
    const lists = await Promise.all(near.map((c) => this.realMembers(c).then((real) => real ?? clusterStars(c))));
    if (key !== this.shown) return;
    const stars = lists.flat();
    this.members.set(stars.length, (i) => ({ ...stars[i].position, absMag: stars[i].absMag, bv: stars[i].bv }));
  }

  private async realMembers(c: Cluster): Promise<ClusterStar[] | null> {
    if (!this.index) {
      const j = await fetch('/data/cluster-members.json')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      this.index = (j as { index: Record<string, [number, number, number]> } | null)?.index ?? {};
    }
    const at = this.index[c.name];
    if (!at) return null;
    let p = this.shards.get(at[0]);
    if (!p) {
      p = fetch(`/data/cluster-members/${at[0]}.bin`)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((b) => (b ? new Float32Array(b) : null))
        .catch(() => null);
      this.shards.set(at[0], p);
    }
    const data = await p;
    return data ? readRealMembers(data, at[1], at[2], c) : null;
  }
}
