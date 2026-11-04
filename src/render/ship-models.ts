/**
 * 宇宙船の形（要件 F27）。3 種類の船体を、three.js の基本の形を組み合わせて作る（外部の 3D モデルは使わない）。
 * 前が −Z（カメラと同じ）、上が +Y、原点が船の中心。単位は km（作るときは m で書いて 1/1000 にする）。
 * 船体の色はプレイヤーの色（色相）、ほかは決まった色。形と色は見た目のための仮のもの（docs/tech/ships.md）。
 */
import * as THREE from 'three/webgpu';
import { HULLS, type HullType } from '../world/ship-design';

const M = 0.001; // 1 m を km で

export interface ShipModel {
  group: THREE.Group;
  /** 船体の色を変える */
  setHue(hue: number): void;
  dispose(): void;
}

function materials() {
  const hull = new THREE.MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0.4 });
  // 翼は左右を鏡に映して作るので、裏側も描く
  const trim = new THREE.MeshStandardNodeMaterial({ color: 0x3a3e46, roughness: 0.6, metalness: 0.6, side: THREE.DoubleSide });
  const glass = new THREE.MeshStandardNodeMaterial({ color: 0x1a2a3a, roughness: 0.1, metalness: 0.2, emissive: 0x0a1a2a });
  const engine = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.55, 0.8, 1.6) });
  return { hull, trim, glass, engine };
}

type Mats = ReturnType<typeof materials>;

function add(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x * M, y * M, z * M);
  group.add(mesh);
  return mesh;
}

/** 細長い矢の形（全長 40 m） */
function arrow(g: THREE.Group, m: Mats) {
  const body = new THREE.CylinderGeometry(1.2 * M, 2.6 * M, 28 * M, 12);
  body.rotateX(Math.PI / 2); // 細い方が −Z（前）
  add(g, body, m.hull, 0, 0, -2);
  const nose = new THREE.ConeGeometry(1.2 * M, 10 * M, 12);
  nose.rotateX(-Math.PI / 2);
  add(g, nose, m.hull, 0, 0, -21);
  const canopy = new THREE.SphereGeometry(1.4 * M, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  canopy.scale(1, 0.7, 2.2);
  add(g, canopy, m.glass, 0, 1.6, -10);
  // 後ろへ反った翼（平たい三角形）
  const wingShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(13, 9), new THREE.Vector2(13, 13), new THREE.Vector2(0, 12)]);
  for (const side of [1, -1]) {
    const wing = new THREE.ExtrudeGeometry(wingShape, { depth: 0.6, bevelEnabled: false });
    wing.scale(side * M, M, M);
    wing.rotateX(Math.PI / 2);
    wing.translate(side * 1.5 * M, 0.3 * M, -2 * M);
    add(g, wing, m.trim);
  }
  const fin = new THREE.BoxGeometry(0.5 * M, 6 * M, 7 * M);
  add(g, fin, m.trim, 0, 4, 9);
  for (const x of [-1.4, 1.4]) {
    const nozzle = new THREE.CylinderGeometry(1.1 * M, 1.3 * M, 2 * M, 12);
    nozzle.rotateX(Math.PI / 2);
    add(g, nozzle, m.trim, x, 0, 12.5);
    const glow = new THREE.CircleGeometry(0.9 * M, 12);
    add(g, glow, m.engine, x, 0, 13.6);
  }
}

/** 円盤の形（直径 30 m） */
function disk(g: THREE.Group, m: Mats) {
  const saucer = new THREE.CylinderGeometry(15 * M, 13 * M, 3 * M, 48);
  add(g, saucer, m.hull);
  const rim = new THREE.TorusGeometry(14.5 * M, 0.8 * M, 8, 48);
  rim.rotateX(Math.PI / 2);
  add(g, rim, m.trim);
  const dome = new THREE.SphereGeometry(5 * M, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 0.6, 1);
  add(g, dome, m.glass, 0, 1.5, -2);
  const belly = new THREE.SphereGeometry(7 * M, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  belly.scale(1, 0.35, 1);
  add(g, belly, m.trim, 0, -1.5, 0);
  for (const x of [-6, 0, 6]) {
    const nozzle = new THREE.BoxGeometry(3 * M, 1.6 * M, 2 * M);
    add(g, nozzle, m.trim, x, 0, 13.5);
    const glow = new THREE.PlaneGeometry(2.4 * M, 1 * M);
    add(g, glow, m.engine, x, 0, 14.6);
  }
}

/** 箱を連ねた運搬船（全長 80 m） */
function hauler(g: THREE.Group, m: Mats) {
  const cockpit = new THREE.BoxGeometry(8 * M, 6 * M, 10 * M);
  add(g, cockpit, m.hull, 0, 1, -34);
  const window = new THREE.BoxGeometry(6 * M, 1.6 * M, 0.4 * M);
  add(g, window, m.glass, 0, 2.5, -39.1);
  const spine = new THREE.BoxGeometry(2.5 * M, 2.5 * M, 60 * M);
  add(g, spine, m.trim, 0, 0, 0);
  for (const z of [-18, -4, 10]) {
    const cargo = new THREE.BoxGeometry(10 * M, 8 * M, 12 * M);
    add(g, cargo, m.hull, 0, 0, z);
  }
  const engineBlock = new THREE.BoxGeometry(12 * M, 9 * M, 8 * M);
  add(g, engineBlock, m.trim, 0, 0, 26);
  for (const [x, y] of [[-3.5, -2.5], [3.5, -2.5], [-3.5, 2.5], [3.5, 2.5]]) {
    const nozzle = new THREE.CylinderGeometry(1.6 * M, 2.2 * M, 4 * M, 12);
    nozzle.rotateX(Math.PI / 2);
    add(g, nozzle, m.trim, x, y, 32);
    const glow = new THREE.CircleGeometry(1.4 * M, 12);
    add(g, glow, m.engine, x, y, 34.1);
  }
}

const BUILDERS: Record<HullType, (g: THREE.Group, m: Mats) => void> = { arrow, disk, hauler };

export function createShipModel(hull: HullType, hue: number): ShipModel {
  const group = new THREE.Group();
  const m = materials();
  BUILDERS[hull](group, m);
  group.name = `ship-${hull}`;
  const color = new THREE.Color();
  const model: ShipModel = {
    group,
    setHue(h: number) {
      m.hull.color.copy(color.setHSL(h / 360, 0.6, 0.55));
    },
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      Object.values(m).forEach((x) => x.dispose());
    },
  };
  model.setHue(hue);
  return model;
}

/** 船体の大きさ（km）。三人称のカメラの距離などに使う */
export const hullLengthKm = (hull: HullType): number => HULLS[hull].lengthKm;
