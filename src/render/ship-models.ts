/**
 * 宇宙船の形（要件 F27）。ブロックの船（src/world/ship-blocks.ts）を面にしたもの（src/world/voxel-mesh.ts）を、three.js の形にする。
 * 最初から選べる 3 つの UFO も、同じブロックで組んだもの（src/world/ship-presets.ts。2026-11-21 から）。
 * 前が −Z（カメラと同じ）、上が +Y、原点が船の中心（ブロックのある範囲の真ん中）。単位は km（面は m で作って 1/1000 にする）。
 * 色はブロックの色。光るブロックは、光を受けずに明るく描く（決まりは docs/tech/ships.md）。
 */
import * as THREE from 'three/webgpu';
import { vertexColor } from 'three/tsl';
import type { Block } from '../world/ship-blocks';
import type { ShipShape } from '../world/ship-presets';
import { buildShipMesh, type MeshPart, type ShipMesh } from '../world/voxel-mesh';

export { customKey, presetKey, presetShape, type ShipShape } from '../world/ship-presets';

const M = 0.001; // 1 m を km で
/** 光るブロックの明るさ（色に掛ける。1 より大きいと、明るい光に見える） */
const GLOW_GAIN = 1.7;

export interface ShipModel {
  group: THREE.Group;
  /** 船の大きさ（km。横の長い方）。三人称のカメラの距離などに使う */
  lengthKm: number;
  dispose(): void;
}

/** 面にしたものを覚えておく数。同じ形の船が何隻いても、面にするのは 1 回 */
const MESH_CACHE_SIZE = 48;
const meshCache = new Map<string, ShipMesh>();

/** key（形ごとに決まった名前）のブロックを面にする。前に作ったものがあれば、それを使う */
export function shipMeshFor(key: string, blocks: readonly Block[]): ShipMesh {
  let mesh = meshCache.get(key);
  if (mesh) {
    // 最近使ったものを後ろへ（古いものから捨てる）
    meshCache.delete(key);
    meshCache.set(key, mesh);
    return mesh;
  }
  mesh = buildShipMesh(blocks);
  meshCache.set(key, mesh);
  if (meshCache.size > MESH_CACHE_SIZE) meshCache.delete(meshCache.keys().next().value as string);
  return mesh;
}


function geometryOf(part: MeshPart): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(part.colors, 3));
  g.setIndex(new THREE.BufferAttribute(part.indices, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * 世界の画面で、光の当たらない側もうっすら見えるように、ブロックの色に掛けて足す明るさ（2026-11-21 にオーナーの指示。
 * 宇宙では光が太陽からしか来ないので、影の側が真っ黒になっていた）。見た目のための値
 */
export const WORLD_SELF_LIGHT = 0.3;

/**
 * 面にしたブロックの船を、three.js の形にする（単位は m のまま。scaleToKm が true なら km にする）。
 * selfLight：光の当たらない側の明るさ（ブロックの色に掛ける。0 なら光の当たる側だけ）
 */
export function createMeshModel(mesh: ShipMesh, scaleToKm = true, selfLight = 0): ShipModel {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  if (scaleToKm) inner.scale.setScalar(M);
  group.add(inner);
  const owned: { dispose(): void }[] = [];
  if (mesh.solid.indices.length > 0) {
    const geometry = geometryOf(mesh.solid);
    const material = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 });
    if (selfLight > 0) material.emissiveNode = vertexColor().mul(selfLight);
    inner.add(new THREE.Mesh(geometry, material));
    owned.push(geometry, material);
  }
  if (mesh.glow.indices.length > 0) {
    const geometry = geometryOf(mesh.glow);
    const material = new THREE.MeshBasicNodeMaterial({ vertexColors: true, color: new THREE.Color(GLOW_GAIN, GLOW_GAIN, GLOW_GAIN) });
    inner.add(new THREE.Mesh(geometry, material));
    owned.push(geometry, material);
  }
  return {
    group,
    lengthKm: mesh.lengthM * M,
    dispose() {
      owned.forEach((o) => o.dispose());
    },
  };
}

export function createShipModel(shape: ShipShape, selfLight = 0): ShipModel {
  const model = createMeshModel(shipMeshFor(shape.key, shape.blocks), true, selfLight);
  model.group.name = `ship-${shape.key}`;
  return model;
}

/** 船の大きさ（km）。三人称のカメラの距離などに使う */
export const shapeLengthKm = (shape: ShipShape): number => shipMeshFor(shape.key, shape.blocks).lengthM * M;
/** 船の前後方向の大きさ（km。Z 軸の幅）。一人称カメラを UFO の前に置くのに使う */
export const shapeDepthKm = (shape: ShipShape): number => shipMeshFor(shape.key, shape.blocks).sizeM.z * M;
