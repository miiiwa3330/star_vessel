/**
 * 天体を描く（太陽系の天体と、いる恒星系の系外惑星）。
 *
 * 自分の船を原点に置き、天体は「自分から見た相対位置（km）」に置く。
 * 位置の引き算は倍精度（JavaScript）で済ませてから GPU に渡すので、遠くでも位置がガタつかない。
 * 天体の一覧（src/world/solar-system.ts）が変わったら、描く物を作り直す。
 */
import * as THREE from 'three/webgpu';
import {
  allBodies,
  bodiesVersion,
  bodyFixedToEqj,
  heliocentricPositionKm,
  type BodyId,
  type BodyInfo,
} from '../world/solar-system';
import { sub, type Vec3 } from '../world/vec';
import { hashInts } from '../world/random';
import { DEFAULT_LOOK, RING_COLOR, SURFACE_LOOKS } from './body-looks';
import { sphereToEqj, toMatrix4 } from './orientation';
import { createRingMesh, surfaceTexture } from './surface-texture';

export type BodyTextures = Partial<Record<BodyId, THREE.Texture>>;

/** 天体の名前から、模様の種を決める（同じ天体はいつも同じ模様） */
const seedOf = (id: string) => hashInts(...Array.from(id, (c) => c.charCodeAt(0)));

interface Drawn {
  mesh: THREE.Mesh;
  info: BodyInfo;
  /** この天体のために作った物（作り直すときに捨てる） */
  owned: { dispose(): void }[];
}

export class SolarSystemView {
  readonly scene = new THREE.Scene();
  private readonly drawn = new Map<BodyId, Drawn>();
  /** 恒星の光。いちばん近い恒星（太陽、またはいる恒星系の恒星）に置く */
  private readonly starLight = new THREE.PointLight(0xffffff, 3, 0, 0);
  private readonly tmp = new THREE.Matrix4();
  private version = -1;

  constructor(private readonly textures: BodyTextures) {
    this.scene.add(this.starLight, new THREE.AmbientLight(0xffffff, 0.03));
  }

  private create(info: BodyInfo): Drawn {
    const owned: { dispose(): void }[] = [];
    const big = info.radiusKm > 1_000;
    const geometry = new THREE.SphereGeometry(info.radiusKm, big ? 96 : 32, big ? 48 : 16);
    owned.push(geometry);
    let material: THREE.Material;
    if (info.glow) {
      material = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(...info.glow) });
    } else {
      let map = this.textures[info.id] ?? null;
      if (!map) {
        const look = info.surface?.look ?? SURFACE_LOOKS[info.id] ?? DEFAULT_LOOK;
        const seed = info.surface?.seed ?? seedOf(info.id);
        // 小さな天体は画像も小さくして、作る時間を減らす
        // 系外惑星は恒星系に入るたびに作るので、画像を小さくして作る時間を減らす
        map = big && info.kind !== 'exoplanet' ? surfaceTexture(look, seed, 512, 256) : surfaceTexture(look, seed, 256, 128);
        owned.push(map);
      }
      material = new THREE.MeshStandardNodeMaterial({ map, roughness: 1, metalness: 0 });
    }
    owned.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = info.id;
    mesh.matrixAutoUpdate = false;
    if (info.rings) {
      const ring = createRingMesh(info.rings, RING_COLOR, seedOf(info.id));
      owned.push(ring.geometry, ring.material as THREE.Material);
      mesh.add(ring);
    }
    this.scene.add(mesh);
    return { mesh, info, owned };
  }

  /** 天体の一覧が変わっていたら、描く物を合わせる */
  private sync(): void {
    if (this.version === bodiesVersion()) return;
    this.version = bodiesVersion();
    const now = new Map(allBodies().map((b) => [b.id, b]));
    for (const [id, d] of this.drawn) {
      if (now.get(id) === d.info) continue;
      this.scene.remove(d.mesh);
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
    for (const [id, d] of this.drawn) {
      const rel = sub(heliocentricPositionKm(id, date), observerKm);
      toMatrix4(sphereToEqj(bodyFixedToEqj(id, date)), this.tmp);
      this.tmp.setPosition(rel.x, rel.y, rel.z);
      d.mesh.matrix.copy(this.tmp);
      d.mesh.matrixWorldNeedsUpdate = true;
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
    }
  }
}
