/**
 * 太陽系の天体を描く。
 *
 * 自分の船を原点に置き、天体は「自分から見た相対位置（km）」に置く。
 * 位置の引き算は倍精度（JavaScript）で済ませてから GPU に渡すので、遠くでも位置がガタつかない。
 */
import * as THREE from 'three/webgpu';
import { BODIES, bodyFixedToEqj, heliocentricPositionKm, type BodyId } from '../world/solar-system';
import { sub, type Vec3 } from '../world/vec';
import { sphereToEqj, toMatrix4 } from './orientation';

/** 画像が無い天体の色。見た目のための値で、観測の値ではない */
const PLAIN_COLORS: Partial<Record<BodyId, number>> = {
  Mercury: 0x9a9690,
  Venus: 0xe8d6a8,
  Mars: 0xc1623b,
  Jupiter: 0xd8b98c,
  Saturn: 0xe3cf9a,
  Uranus: 0x9fd8e0,
  Neptune: 0x4f73d8,
  Pluto: 0xcbb59a,
};

export interface BodyTextures {
  Earth?: THREE.Texture;
  Moon?: THREE.Texture;
}

export class SolarSystemView {
  readonly scene = new THREE.Scene();
  private readonly meshes = new Map<BodyId, THREE.Mesh>();
  private readonly sunLight = new THREE.PointLight(0xffffff, 3, 0, 0);
  private readonly tmp = new THREE.Matrix4();

  constructor(textures: BodyTextures) {
    this.scene.add(this.sunLight, new THREE.AmbientLight(0xffffff, 0.03));
    for (const body of BODIES) {
      const detailed = body.id === 'Earth' || body.id === 'Moon' || body.id === 'Sun';
      const geometry = new THREE.SphereGeometry(body.radiusKm, detailed ? 96 : 32, detailed ? 48 : 16);
      const material =
        body.id === 'Sun'
          ? new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(1, 0.95, 0.85) })
          : new THREE.MeshStandardNodeMaterial({
              map: textures[body.id as keyof BodyTextures] ?? null,
              color: textures[body.id as keyof BodyTextures] ? 0xffffff : (PLAIN_COLORS[body.id] ?? 0xffffff),
              roughness: 1,
              metalness: 0,
            });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = body.id;
      mesh.matrixAutoUpdate = false;
      this.meshes.set(body.id, mesh);
      this.scene.add(mesh);
    }
  }

  /** date の時刻の天体を、observerKm（太陽中心・EQJ）から見た位置に置く */
  update(date: Date, observerKm: Vec3): void {
    for (const [id, mesh] of this.meshes) {
      const rel = sub(heliocentricPositionKm(id, date), observerKm);
      toMatrix4(sphereToEqj(bodyFixedToEqj(id, date)), this.tmp);
      this.tmp.setPosition(rel.x, rel.y, rel.z);
      mesh.matrix.copy(this.tmp);
      mesh.matrixWorldNeedsUpdate = true;
      if (id === 'Sun') this.sunLight.position.set(rel.x, rel.y, rel.z);
    }
  }
}
