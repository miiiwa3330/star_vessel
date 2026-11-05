/**
 * 宇宙船の形（要件 F27）。3 種類の UFO の船体を、three.js の基本の形を組み合わせて作る（外部の 3D モデルは使わない）。
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

/** まわりに並べる光（緑・黄・赤…と順に。見た目のための色） */
const RIM_COLORS = [0x7dffb0, 0xffe07a, 0xff7a8a, 0x7ad8ff];
function rimLights(g: THREE.Group, radiusM: number, count: number, y: number, sizeM: number, owned: THREE.Material[]) {
  const geo = new THREE.SphereGeometry(sizeM * M, 8, 6);
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2;
    const mat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(RIM_COLORS[k % RIM_COLORS.length]).multiplyScalar(1.4) });
    owned.push(mat);
    add(g, geo, mat, Math.cos(a) * radiusM, y, Math.sin(a) * radiusM);
  }
}

/** 前の目印（前が分かるように、前のふちに白い灯り） */
function frontLight(g: THREE.Group, zM: number, y: number, owned: THREE.Material[]) {
  const mat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(2, 2, 2) });
  owned.push(mat);
  add(g, new THREE.SphereGeometry(0.6 * M, 8, 6), mat, 0, y, zM);
}

/** 平たい円盤に小さなドーム（直径 30 m） */
function saucer(g: THREE.Group, m: Mats, owned: THREE.Material[]) {
  // 上下の皿（レンズの形）
  const top = new THREE.SphereGeometry(15 * M, 48, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  top.scale(1, 0.16, 1);
  add(g, top, m.hull);
  const bottom = new THREE.SphereGeometry(15 * M, 48, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  bottom.scale(1, 0.12, 1);
  add(g, bottom, m.trim);
  const rim = new THREE.TorusGeometry(14.6 * M, 0.5 * M, 8, 64);
  rim.rotateX(Math.PI / 2);
  add(g, rim, m.trim);
  const dome = new THREE.SphereGeometry(5 * M, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 0.8, 1);
  add(g, dome, m.glass, 0, 2.2, 0);
  // 下の光る輪（推進の光）
  const glow = new THREE.RingGeometry(3 * M, 5 * M, 32);
  glow.rotateX(Math.PI / 2);
  add(g, glow, m.engine, 0, -1.85, 0);
  rimLights(g, 15.3, 12, 0, 0.55, owned);
  frontLight(g, -14.8, 0.2, owned);
}

/** 背の高いドームに丸窓、下に 3 つの球（直径 24 m） */
function bell(g: THREE.Group, m: Mats, owned: THREE.Material[]) {
  const base = new THREE.CylinderGeometry(9 * M, 12 * M, 3 * M, 48);
  add(g, base, m.hull, 0, -1, 0);
  const rim = new THREE.TorusGeometry(12 * M, 0.6 * M, 8, 64);
  rim.rotateX(Math.PI / 2);
  add(g, rim, m.trim, 0, -2.4, 0);
  const body = new THREE.CylinderGeometry(6 * M, 8.5 * M, 6 * M, 48);
  add(g, body, m.hull, 0, 3.5, 0);
  const dome = new THREE.SphereGeometry(6 * M, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  add(g, dome, m.glass, 0, 6.5, 0);
  // 丸窓
  const port = new THREE.CircleGeometry(1.1 * M, 16);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const w = add(g, port, m.engine, Math.sin(a) * 7.35, 3.5, Math.cos(a) * 7.35);
    w.rotation.y = a;
  }
  // 下の 3 つの球
  const ball = new THREE.SphereGeometry(2.2 * M, 16, 12);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
    add(g, ball, m.trim, Math.cos(a) * 6, -4, Math.sin(a) * 6);
  }
  rimLights(g, 12.8, 10, -2.4, 0.5, owned);
  frontLight(g, -12.6, -2.4, owned);
}

/** 光る球のまわりに 2 重の輪（直径 36 m） */
function ring(g: THREE.Group, m: Mats, owned: THREE.Material[]) {
  const core = new THREE.SphereGeometry(6 * M, 32, 16);
  add(g, core, m.glass);
  const coreGlow = new THREE.SphereGeometry(3.5 * M, 24, 12);
  add(g, coreGlow, m.engine);
  const inner = new THREE.TorusGeometry(11 * M, 1.6 * M, 12, 64);
  inner.rotateX(Math.PI / 2);
  add(g, inner, m.hull);
  const outer = new THREE.TorusGeometry(17 * M, 1 * M, 12, 64);
  outer.rotateX(Math.PI / 2);
  add(g, outer, m.trim);
  // 輪をつなぐ 4 本の腕
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const arm = new THREE.BoxGeometry(12 * M, 0.8 * M, 1.2 * M);
    const mesh = add(g, arm, m.trim, Math.cos(a) * 11, 0, Math.sin(a) * 11);
    mesh.rotation.y = -a;
  }
  rimLights(g, 17, 16, 1.1, 0.45, owned);
  frontLight(g, -18.2, 0, owned);
}

const BUILDERS: Record<HullType, (g: THREE.Group, m: Mats, owned: THREE.Material[]) => void> = { saucer, bell, ring };

export function createShipModel(hull: HullType, hue: number): ShipModel {
  const group = new THREE.Group();
  const m = materials();
  const owned: THREE.Material[] = [];
  BUILDERS[hull](group, m, owned);
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
      owned.forEach((x) => x.dispose());
    },
  };
  model.setHue(hue);
  return model;
}

/** 船体の大きさ（km）。三人称のカメラの距離などに使う */
export const hullLengthKm = (hull: HullType): number => HULLS[hull].lengthKm;
