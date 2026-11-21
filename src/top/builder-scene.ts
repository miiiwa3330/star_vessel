/**
 * 宇宙船を作る画面の 3D（要件 F27。2026-11-21）。作れる範囲（40 m の箱）と床の格子、前の向きの矢印、作っている船、
 * 次に置く所の印（半透明のブロック）を描く。カメラは船のまわりを回る（ドラッグ）・近づく（ホイール・ピンチ）。
 *
 * 位置の単位は m で、原点は作れる範囲の真ん中（床の高さ）。マス（0.5 m）との変換は toCell・toM。
 * 画面の操作（どこを押したか・何をするか）は ShipBuilder.tsx、置く位置などの計算は src/world/ship-builder.ts。
 */
import * as THREE from 'three/webgpu';
import { CELL_M, GRID, BUILD_RANGE_M, PALETTE, blockCells, type Block, type BlockSize } from '../world/ship-blocks';
import type { V3 } from '../world/ship-builder';
import { createMeshModel, type ShipModel } from '../render/ship-models';
import { buildShipMesh } from '../world/voxel-mesh';

const HALF = BUILD_RANGE_M / 2;
/** カメラの距離の範囲（m） */
const MIN_DIST = 6;
const MAX_DIST = 170;
/** 最初に、この半径（m）の球が画面の縦にも横にも収まる距離から見る */
const FIT_RADIUS_M = 22;
/** 見下ろす角度の範囲（ラジアン。真上・真下までは回さない） */
const MAX_PITCH = 1.45;
/** 一度に出せる印の数（対称で 4 つまで） */
const MAX_GHOSTS = 4;

const toM = (cell: number): number => (cell - GRID / 2) * CELL_M;
const toCell = (m: number): number => m / CELL_M + GRID / 2;

export type GhostMode = 'place' | 'erase' | 'paint' | 'blocked';

export class BuilderScene {
  private readonly renderer: THREE.WebGPURenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  private readonly owned: { dispose(): void }[] = [];
  private model: ShipModel | null = null;
  private readonly ghosts: THREE.Mesh[] = [];
  private readonly ghostMat: THREE.MeshBasicNodeMaterial;
  private readonly ghostEdgeMat: THREE.LineBasicNodeMaterial;
  private readonly raycaster = new THREE.Raycaster();
  private yaw = -0.75;
  private pitch = 0.42;
  private dist = 62;
  private fitted = false;
  private disposed = false;
  private dirty = true;

  private constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: false });
    this.scene.background = new THREE.Color(0x05070d);

    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1c24, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(30, 50, 25);
    const rim = new THREE.DirectionalLight(0x74e6ff, 0.9);
    rim.position.set(-40, 10, -30);
    this.scene.add(key, rim);

    // 床の格子（1 m ごと。5 m ごとに少し明るく）と、作れる範囲の箱
    const fine: number[] = [];
    const bold: number[] = [];
    for (let i = 0; i <= BUILD_RANGE_M; i++) {
      const v = i - HALF;
      const list = i % 5 === 0 ? bold : fine;
      list.push(-HALF, 0, v, HALF, 0, v, v, 0, -HALF, v, 0, HALF);
    }
    const lineSet = (points: number[], color: number, opacity: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      const m = new THREE.LineBasicNodeMaterial({ color, transparent: true, opacity, depthWrite: false });
      this.owned.push(g, m);
      const l = new THREE.LineSegments(g, m);
      this.scene.add(l);
      return l;
    };
    lineSet(fine, 0x9fb4e0, 0.1);
    lineSet(bold, 0x9fb4e0, 0.24);
    const boxEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(BUILD_RANGE_M, BUILD_RANGE_M, BUILD_RANGE_M));
    const boxMat = new THREE.LineBasicNodeMaterial({ color: 0x9fb4e0, transparent: true, opacity: 0.16, depthWrite: false });
    this.scene.add(new THREE.LineSegments(boxEdges, boxMat));
    this.owned.push(boxEdges, boxMat);

    // 前（−Z）の向きの矢印：床の前のふちの外に、オレンジの三角
    const arrow = new THREE.Shape();
    arrow.moveTo(0, -3.2);
    arrow.lineTo(2.2, 0);
    arrow.lineTo(0.8, 0);
    arrow.lineTo(0.8, 2);
    arrow.lineTo(-0.8, 2);
    arrow.lineTo(-0.8, 0);
    arrow.lineTo(-2.2, 0);
    arrow.closePath();
    const arrowGeo = new THREE.ShapeGeometry(arrow);
    arrowGeo.rotateX(Math.PI / 2);
    const arrowMat = new THREE.MeshBasicNodeMaterial({ color: 0xff8a1f, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
    arrowMesh.position.set(0, 0, -HALF - 2.4);
    this.scene.add(arrowMesh);
    this.owned.push(arrowGeo, arrowMat);

    // 次に置く所の印
    this.ghostMat = new THREE.MeshBasicNodeMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
    this.ghostEdgeMat = new THREE.LineBasicNodeMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false });
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const unitEdges = new THREE.EdgesGeometry(unit);
    this.owned.push(unit, unitEdges, this.ghostMat, this.ghostEdgeMat);
    for (let i = 0; i < MAX_GHOSTS; i++) {
      const g = new THREE.Mesh(unit, this.ghostMat);
      g.add(new THREE.LineSegments(unitEdges, this.ghostEdgeMat));
      g.visible = false;
      g.renderOrder = 2;
      this.ghosts.push(g);
      this.scene.add(g);
    }
    this.placeCamera();
  }

  static async create(canvas: HTMLCanvasElement): Promise<BuilderScene> {
    const s = new BuilderScene(canvas);
    await s.renderer.init();
    return s;
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    if (this.disposed || width === 0 || height === 0) return;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    // 最初の 1 回だけ：縦長の画面（スマホ）でも、船が横にはみ出さない距離にする
    if (!this.fitted) {
      this.fitted = true;
      const halfV = (this.camera.fov * Math.PI) / 360;
      const halfH = Math.atan(Math.tan(halfV) * this.camera.aspect);
      this.dist = Math.min(MAX_DIST, Math.max(this.dist, FIT_RADIUS_M / Math.sin(Math.min(halfV, halfH))));
    }
    this.placeCamera();
  }

  /** 作っている船を描き直す */
  setBlocks(blocks: readonly Block[]): void {
    if (this.model) {
      this.scene.remove(this.model.group);
      this.model.dispose();
    }
    this.model = createMeshModel(buildShipMesh(blocks, 'grid'), false);
    this.scene.add(this.model.group);
    this.dirty = true;
  }

  /** 印を出す（positions：小さい側の角のマス。mode で色を変える）。null なら消す */
  setGhosts(positions: readonly V3[] | null, s: BlockSize, mode: GhostMode, color: number): void {
    const n = blockCells({ s }) * CELL_M;
    const tint = mode === 'blocked' ? 0xff5a5a : mode === 'erase' ? 0xff8a1f : PALETTE[color].hex;
    this.ghostMat.color.setHex(tint);
    this.ghostMat.opacity = mode === 'erase' ? 0.25 : mode === 'blocked' ? 0.3 : 0.5;
    this.ghostEdgeMat.color.setHex(mode === 'blocked' ? 0xff5a5a : mode === 'erase' ? 0xff8a1f : 0xffffff);
    this.ghosts.forEach((g, i) => {
      const p = positions?.[i];
      g.visible = !!p;
      if (!p) return;
      // 消す・塗るときは、ブロックより少しだけ大きく（ブロックの面と重なってちらつかないように）
      const grow = mode === 'place' || mode === 'blocked' ? 0.995 : 1.03;
      g.scale.setScalar(n * grow);
      g.position.set(toM(p[0]) + n / 2, toM(p[1]) + n / 2, toM(p[2]) + n / 2);
    });
    this.dirty = true;
  }

  /** 回す（ドラッグの量 px） */
  orbit(dxPx: number, dyPx: number): void {
    this.yaw -= dxPx * 0.006;
    this.pitch = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, this.pitch + dyPx * 0.006));
    this.placeCamera();
  }

  /** 近づく・離れる（factor < 1 で近づく） */
  zoom(factor: number): void {
    this.dist = Math.min(MAX_DIST, Math.max(MIN_DIST, this.dist * factor));
    this.placeCamera();
  }

  private placeCamera(): void {
    const c = Math.cos(this.pitch);
    this.camera.position.set(Math.sin(this.yaw) * c * this.dist, Math.sin(this.pitch) * this.dist, Math.cos(this.yaw) * c * this.dist);
    this.camera.lookAt(0, 0, 0);
    this.dirty = true;
  }

  /** 画面の点（canvas の中の割合 −1〜1）から伸ばした線を、マスの単位で返す */
  rayAt(ndcX: number, ndcY: number): { o: V3; d: V3 } {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const { origin, direction } = this.raycaster.ray;
    return {
      o: [toCell(origin.x), toCell(origin.y), toCell(origin.z)],
      d: [direction.x, direction.y, direction.z],
    };
  }

  /** 変わったときだけ描く */
  render(): void {
    if (this.disposed || !this.dirty) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.disposed = true;
    this.model?.dispose();
    this.owned.forEach((o) => o.dispose());
    this.renderer.dispose();
  }
}
