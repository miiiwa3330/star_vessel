/**
 * 星座の絵を、空に重ねて描く（2026-11-13）。星を描く場面（pc 単位）に置く。出すのは、選んだ星座 1 つだけ。
 * 絵は Stellarium の星座の絵（黒い地に、明るい線と面。足し合わせて描くので、黒いところは透ける）。
 * 絵の上の 3 つの点を、決まった星の方向に合わせて貼る（src/world/constellation-figure.ts）。
 *
 * 絵は太陽のそばから見た空に合わせたものなので、太陽を中心にした大きな球（半径 ART_RADIUS_PC）の上に貼り、
 * 太陽から離れると薄くして消す（離れると、星の並びが変わって絵と合わなくなるため）
 */
import * as THREE from 'three/webgpu';
import { texture, uniform, vec3 } from 'three/tsl';
import { artGrid, type ConstellationArt } from '../world/constellation-figure';
import type { Vec3 } from '../world/vec';

/** 絵を貼る球の半径（pc）。太陽系の中を動いても絵がずれて見えないよう、十分に遠くする */
const ART_RADIUS_PC = 2_000;
/** 絵の明るさ（星や線が絵に埋もれないように、うすく）と色（線の色に近い、うすい青） */
const ART_OPACITY = 0.5;
const ART_TINT: readonly [number, number, number] = [0.62, 0.78, 1];
/** 太陽からこの距離（pc）を超えると薄くし、遠い方の距離で消す */
const FADE_PC = { start: 1, end: 6 };
/** 出す・消すときに、明るさが変わる速さ（1/秒） */
const FADE_RATE = 4;

export class ConstellationArtView {
  readonly group = new THREE.Group();
  private readonly loader = new THREE.TextureLoader();
  private readonly opacity = uniform(0);
  private mesh: THREE.Mesh | null = null;
  private map: THREE.Texture | null = null;
  private id: string | null = null;
  private shown = 0;
  private wanted = false;

  constructor(private readonly arts: ReadonlyMap<string, ConstellationArt>) {}

  /** いま出している星座の略号 */
  get shownId(): string | null {
    return this.wanted ? this.id : null;
  }

  has(id: string): boolean {
    return this.arts.has(id);
  }

  /** 星座の絵を出す。絵の無い星座なら false */
  show(id: string): boolean {
    const art = this.arts.get(id);
    const grid = art ? artGrid(art) : null;
    if (!art || !grid) return false;
    this.clear();
    this.id = id;
    this.wanted = true;
    this.shown = 0;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(grid.directions.length);
    for (let i = 0; i < positions.length; i++) positions[i] = grid.directions[i] * ART_RADIUS_PC;
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(grid.uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(grid.indices, 1));
    const map = this.loader.load(`/textures/constellations/${art.file}`);
    map.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    material.colorNode = texture(map).rgb.mul(vec3(...ART_TINT)).mul(this.opacity);
    this.map = map;
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = `constellation-art:${id}`;
    this.group.add(this.mesh);
    return true;
  }

  /** 絵を消す（ゆっくり薄くなってから無くなる） */
  hide(): void {
    this.wanted = false;
  }

  /** 毎フレーム：出す・消すの明るさと、太陽から離れたときの薄さ */
  update(cameraPc: Vec3, dt: number): void {
    if (!this.mesh) return;
    this.shown += ((this.wanted ? 1 : 0) - this.shown) * (1 - Math.exp(-FADE_RATE * dt));
    if (!this.wanted && this.shown < 0.01) {
      this.clear();
      return;
    }
    const d = Math.hypot(cameraPc.x, cameraPc.y, cameraPc.z);
    const far = 1 - Math.min(1, Math.max(0, (d - FADE_PC.start) / (FADE_PC.end - FADE_PC.start)));
    this.opacity.value = ART_OPACITY * this.shown * far;
    this.mesh.visible = this.opacity.value > 0.002;
  }

  /** 太陽から離れすぎていて、絵が見えないか */
  static tooFar(cameraPc: Vec3): boolean {
    return Math.hypot(cameraPc.x, cameraPc.y, cameraPc.z) >= FADE_PC.end;
  }

  private clear(): void {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh = null;
    }
    this.map?.dispose();
    this.map = null;
    this.id = null;
    this.shown = 0;
  }
}
