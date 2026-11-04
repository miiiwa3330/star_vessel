/**
 * 天体を描く（太陽系の天体と、いる恒星系の系外惑星・衛星）。
 *
 * 自分の船を原点に置き、天体は「自分から見た相対位置（km）」に置く。
 * 位置の引き算は倍精度（JavaScript）で済ませてから GPU に渡すので、遠くでも位置がガタつかない。
 * 天体の一覧（src/world/solar-system.ts）が変わったら、描く物を作り直す。
 * 大気・恒星の光・環の影は src/render/body-effects.ts（要件 F25）。
 */
import * as THREE from 'three/webgpu';
import { texture } from 'three/tsl';
import {
  allBodies,
  bodiesVersion,
  bodyFixedToEqj,
  heliocentricPositionKm,
  type BodyId,
  type BodyInfo,
} from '../world/solar-system';
import { mulVec, normalize, sub, type Vec3 } from '../world/vec';
import { hashInts } from '../world/random';
import { DEFAULT_LOOK, RING_COLOR, SURFACE_LOOKS } from './body-looks';
import {
  createAtmosphereMesh,
  createBodyUniforms,
  createRingMaterial,
  createStarGlow,
  createStarMaterial,
  ringShadowedColor,
  STAR_GLOW_RADII,
  type BodyUniforms,
} from './body-effects';
import { sphereToEqj, toMatrix4 } from './orientation';
import { SurfacePainter } from './surface-painter';
import { createRingMesh, ringTexture } from './surface-texture';

export type BodyTextures = Partial<Record<BodyId, THREE.Texture>>;

/** 天体の名前から、模様の種を決める（同じ天体はいつも同じ模様） */
const seedOf = (id: string) => hashInts(...Array.from(id, (c) => c.charCodeAt(0)));

/** 模様ができるまでの仮の画像（灰色 1 ピクセル） */
function placeholderTexture(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

interface Drawn {
  mesh: THREE.Mesh;
  info: BodyInfo;
  uniforms: BodyUniforms;
  glow: THREE.Sprite | null;
  /** この天体のために作った物（作り直すときに捨てる） */
  owned: { dispose(): void }[];
  removed: boolean;
}

export class SolarSystemView {
  readonly scene = new THREE.Scene();
  private readonly drawn = new Map<BodyId, Drawn>();
  /** 恒星の光。いちばん近い恒星（太陽、またはいる恒星系の恒星）に置く */
  private readonly starLight = new THREE.PointLight(0xffffff, 3, 0, 0);
  private readonly tmp = new THREE.Matrix4();
  private readonly painter = new SurfacePainter();
  private version = -1;

  constructor(private readonly textures: BodyTextures) {
    this.scene.add(this.starLight, new THREE.AmbientLight(0xffffff, 0.03));
  }

  private create(info: BodyInfo): Drawn {
    const owned: { dispose(): void }[] = [];
    const uniforms = createBodyUniforms();
    const big = info.radiusKm > 1_000;
    const geometry = new THREE.SphereGeometry(info.radiusKm, big ? 96 : 32, big ? 48 : 16);
    owned.push(geometry);
    const d: Drawn = { mesh: null as unknown as THREE.Mesh, info, uniforms, glow: null, owned, removed: false };

    let material: THREE.Material;
    if (info.glow) {
      material = createStarMaterial(info.glow);
      d.glow = createStarGlow(info.glow);
      d.glow.scale.setScalar(info.radiusKm * STAR_GLOW_RADII * 2);
      owned.push(d.glow.material);
      this.scene.add(d.glow);
    } else {
      const given = this.textures[info.id];
      const mapNode = texture(given ?? placeholderTexture());
      const standard = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
      standard.colorNode = mapNode;
      if (!given) {
        // 模様は Worker で描き、できたら差し替える（恒星系に入ったときに画面が止まらないように）
        const look = info.surface?.look ?? SURFACE_LOOKS[info.id] ?? DEFAULT_LOOK;
        const seed = info.surface?.seed ?? seedOf(info.id);
        const size = big && info.kind !== 'exoplanet' ? [512, 256] : info.radiusKm > 300 ? [256, 128] : [128, 64];
        owned.push(mapNode.value as THREE.Texture);
        void this.painter.paint(look, seed, size[0], size[1]).then((t) => {
          if (d.removed) {
            t.dispose();
            return;
          }
          mapNode.value = t;
          owned.push(t);
        });
      }
      if (info.rings) {
        const ringMap = ringTexture(info.rings, info.ringColor ?? RING_COLOR, seedOf(info.id));
        owned.push(ringMap);
        const inner = Math.min(...info.rings.map((z) => z.innerKm));
        const outer = Math.max(...info.rings.map((z) => z.outerKm));
        standard.colorNode = ringShadowedColor(mapNode, ringMap, inner, outer, uniforms);
        const ringMaterial = createRingMaterial(ringMap, info.radiusKm, uniforms);
        owned.push(ringMaterial);
        d.mesh = new THREE.Mesh(geometry, standard);
        const ring = createRingMesh(info.rings, ringMaterial);
        owned.push(ring.geometry);
        d.mesh.add(ring);
      }
      material = standard;
    }
    owned.push(material);
    if (!d.mesh) d.mesh = new THREE.Mesh(geometry, material);
    const mesh = d.mesh;
    mesh.name = info.id;
    mesh.matrixAutoUpdate = false;
    if (info.atmosphere) {
      const atm = createAtmosphereMesh(info.radiusKm, info.atmosphere, uniforms);
      owned.push(atm.geometry, atm.material as THREE.Material);
      mesh.add(atm);
    }
    this.scene.add(mesh);
    return d;
  }

  /** 天体の一覧が変わっていたら、描く物を合わせる */
  private sync(): void {
    if (this.version === bodiesVersion()) return;
    this.version = bodiesVersion();
    const now = new Map(allBodies().map((b) => [b.id, b]));
    for (const [id, d] of this.drawn) {
      if (now.get(id) === d.info) continue;
      this.scene.remove(d.mesh);
      if (d.glow) this.scene.remove(d.glow);
      d.removed = true;
      d.owned.forEach((o) => o.dispose());
      this.drawn.delete(id);
    }
    for (const [id, info] of now) {
      if (!this.drawn.has(id)) this.drawn.set(id, this.create(info));
    }
  }

  /** date の時刻の天体を、observerKm（太陽中心・EQJ）から見た位置に置く */
  update(date: Date, observerKm: Vec3): void {
    this.sync();
    let nearestStar: Vec3 | null = null;
    let nearestGlow: readonly [number, number, number] = [1, 1, 1];
    let nearestD = Number.POSITIVE_INFINITY;
    const rels = new Map<BodyId, Vec3>();
    for (const [id, d] of this.drawn) {
      const rel = sub(heliocentricPositionKm(id, date), observerKm);
      rels.set(id, rel);
      const orient = bodyFixedToEqj(id, date);
      toMatrix4(sphereToEqj(orient), this.tmp);
      this.tmp.setPosition(rel.x, rel.y, rel.z);
      d.mesh.matrix.copy(this.tmp);
      d.mesh.matrixWorldNeedsUpdate = true;
      d.glow?.position.set(rel.x, rel.y, rel.z);
      d.uniforms.center.value.set(rel.x, rel.y, rel.z);
      const pole = mulVec(orient, { x: 0, y: 0, z: 1 });
      d.uniforms.pole.value.set(pole.x, pole.y, pole.z);
      if (d.info.kind === 'star') {
        const dist = Math.hypot(rel.x, rel.y, rel.z);
        if (dist < nearestD) {
          nearestD = dist;
          nearestStar = rel;
          nearestGlow = d.info.glow ?? nearestGlow;
        }
      }
    }
    if (nearestStar) {
      this.starLight.position.set(nearestStar.x, nearestStar.y, nearestStar.z);
      // 光の色は恒星の色（太陽は白に近い）。いちばん明るい成分を 1 にそろえる
      const m = Math.max(...nearestGlow);
      this.starLight.color.setRGB(nearestGlow[0] / m, nearestGlow[1] / m, nearestGlow[2] / m);
      // 大気・環の影に使う、天体から恒星への向き
      for (const [id, d] of this.drawn) {
        if (d.info.kind === 'star') continue;
        const rel = rels.get(id)!;
        const to = normalize(sub(nearestStar, rel));
        d.uniforms.toStar.value.set(to.x, to.y, to.z);
      }
    }
  }
}
