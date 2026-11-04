/**
 * 銀河を描く（要件 F8・F18）。
 *
 * - 銀河の光：たくさんの星をまとめた光の点。中からは天の川の帯に、外からは渦巻きに見える。
 *   自分の近く（GLOW_FADE_PC）ではほぼ見えなくし、1 つずつの星に任せる
 * - まわりの星：本物のデータ（HYG）の範囲の外では、自分のまわりのマス目に星を作る
 * 銀河のモデルは src/world/galaxy.ts、決まりは docs/tech/galaxy.md。
 */
import * as THREE from 'three/webgpu';
import { abs, cameraPosition, clamp, exp, float, instancedBufferAttribute, sign, smoothstep, uniform, uv } from 'three/tsl';
import {
  cellOf,
  DUST_EXTINCTION_LENGTH_KPC,
  DUST_SCALE_HEIGHT_KPC,
  eqjPcToGalacto,
  generateCell,
  sampleGlow,
  type Cell,
  type GeneratedStar,
} from '../world/galaxy';
import { bvToRgb } from '../world/stars';
import type { Vec3 } from '../world/vec';
import { StarSprites } from './star-sprites';

/** 銀河の光の点の数。スマホ（指で操作する端末）では減らす */
const GLOW_COUNT = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ? 60_000 : 150_000;
/** 光の点の明るさ（重なって天の川の帯になる。見た目に合わせた値） */
const GLOW_INTENSITY = 0.05;
/** 自分からこの距離（pc）より近い光は消し、この距離で元の明るさに戻す */
const GLOW_FADE_PC = { near: 300, far: 1500 };
const GLOW_MAX_SIZE_PX = 64;
/** まわりの星を作るマス目の範囲（自分のマス目から ±RADIUS） */
const CELL_RADIUS = 2;
const MAX_LOCAL_STARS = 50_000;
/** 作ったマス目を覚えておく数（行き来しても作り直さないように） */
const CELL_CACHE_SIZE = 4_000;

export class GalaxyView {
  readonly group = new THREE.Group();
  /** 1 ピクセルの大きさを決める値（画面の高さの半分 ÷ tan(視野の半分)）。画面の大きさが変わったら直す */
  private readonly pxPerRadian = uniform(700);
  /** 自分の、銀河の円盤の面からの高さ（kpc） */
  private readonly cameraZ = uniform(0);
  private readonly local = new StarSprites(MAX_LOCAL_STARS);
  private readonly cache = new Map<string, GeneratedStar[]>();
  private currentCell: Cell | null = null;
  /** いま作ってある、まわりの星（住所の恒星系を決めるのにも使う） */
  localStars: GeneratedStar[] = [];

  constructor() {
    this.group.add(this.createGlow(), this.local.sprite);
  }

  setViewport(heightPx: number, fovDeg: number): void {
    this.pxPerRadian.value = heightPx / 2 / Math.tan((fovDeg * Math.PI) / 360);
  }

  /** 自分の位置（太陽中心の EQJ・pc）が別のマス目に入ったら、まわりの星を作り直す */
  update(cameraPc: Vec3): void {
    this.cameraZ.value = eqjPcToGalacto(cameraPc).z;
    const c = cellOf(cameraPc);
    if (this.currentCell && c.ix === this.currentCell.ix && c.iy === this.currentCell.iy && c.iz === this.currentCell.iz) return;
    this.currentCell = c;
    const stars: GeneratedStar[] = [];
    for (let dx = -CELL_RADIUS; dx <= CELL_RADIUS; dx++)
      for (let dy = -CELL_RADIUS; dy <= CELL_RADIUS; dy++)
        for (let dz = -CELL_RADIUS; dz <= CELL_RADIUS; dz++) stars.push(...this.cell({ ix: c.ix + dx, iy: c.iy + dy, iz: c.iz + dz }));
    this.localStars = stars;
    this.local.set(stars.length, (i) => ({ ...stars[i].position, absMag: stars[i].absMag, bv: stars[i].bv }));
  }

  private cell(c: Cell): GeneratedStar[] {
    const key = `${c.ix},${c.iy},${c.iz}`;
    let stars = this.cache.get(key);
    if (!stars) {
      stars = generateCell(c);
      this.cache.set(key, stars);
      if (this.cache.size > CELL_CACHE_SIZE) this.cache.delete(this.cache.keys().next().value as string);
    }
    return stars;
  }

  private createGlow(): THREE.Sprite {
    const g = sampleGlow(GLOW_COUNT);
    const color = new Float32Array(g.count * 3);
    for (let i = 0; i < g.count; i++) {
      const [r, gr, b] = bvToRgb(g.colorIndex[i]);
      const k = GLOW_INTENSITY * g.brightness[i];
      color.set([r * k, gr * k, b * k], i * 3);
    }
    const pos = instancedBufferAttribute<'vec3'>(new THREE.InstancedBufferAttribute(g.positions, 3), 'vec3');
    const sizePc = instancedBufferAttribute<'float'>(new THREE.InstancedBufferAttribute(g.sizePc, 1), 'float');
    const pointZ = instancedBufferAttribute<'float'>(new THREE.InstancedBufferAttribute(g.galactoZ, 1), 'float');
    const dist = pos.sub(cameraPosition).length();
    // 見かけの大きさ（ピクセル）＝ 実際の大きさ ÷ 距離 × 1 ラジアンあたりのピクセル
    const sizePx = sizePc.div(dist).mul(this.pxPerRadian);
    const drawnPx = clamp(sizePx, float(1), float(GLOW_MAX_SIZE_PX));
    // 1 ピクセルより小さく描けない分は暗くする。本物どおり（面積の比＝2 乗）だと遠くの腕が見えにくいので、1 乗にゆるめる
    const flux = sizePx.div(drawnPx);
    // ちり：自分と光の点を結ぶ線が通るちりの量だけ暗くする（src/world/galaxy.ts の meanDustDensity と同じ式）
    const h = DUST_SCALE_HEIGHT_KPC;
    const F = (z: typeof pointZ) => sign(z).mul(float(1).sub(exp(abs(z).div(-h)))).mul(h);
    const eps = 1e-4;
    const meanDust = abs(F(pointZ).sub(F(this.cameraZ)))
      .add(exp(abs(this.cameraZ).div(-h)).mul(eps))
      .div(abs(pointZ.sub(this.cameraZ)).add(eps));
    const dust = exp(dist.div(1000).mul(meanDust).div(-DUST_EXTINCTION_LENGTH_KPC));

    const m = new THREE.PointsNodeMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: false,
    });
    m.positionNode = pos;
    m.sizeNode = drawnPx;
    m.colorNode = instancedBufferAttribute<'vec3'>(new THREE.InstancedBufferAttribute(color, 3), 'vec3').mul(flux).mul(dust);
    const d = uv().sub(0.5).length().mul(2);
    m.opacityNode = exp(d.mul(d).mul(-6)).mul(smoothstep(GLOW_FADE_PC.near, GLOW_FADE_PC.far, dist));
    const sprite = new THREE.Sprite(m);
    sprite.count = g.count;
    sprite.frustumCulled = false;
    return sprite;
  }
}
