/**
 * 宇宙船（UFO）を選ぶ列の 3D の描画（要件 F48）。地球の描画（earth-scene.ts）と同じ画面（同じ GPU の入れ物）に、
 * 地球のあとで重ねて描く。画面の位置は DOM の箱（stage.getRect）に合わせる：1 ワールド単位 = 1 css px になるカメラを置く。
 *
 * 形は世界の画面と同じ（createShipModel）。色はアカウントの色。真ん中の 1 つだけ大きく、左右は小さい（ufo-carousel.ts）。
 * 出るときは右から光の速さで飛んできて減速して止まり、消えるときは左へ加速して消える。速いあいだは、光の筋を後ろ（右）へ引く。
 */
import * as THREE from 'three/webgpu';
import { float, pow, uniform, uv, vec3 } from 'three/tsl';
import { createShipModel, type ShipModel } from '../render/ship-models';
import { HULL_TYPES, HULLS, type HullType } from '../world/ship-design';
import type { TopStage } from './top-stage';
import { flightDuration, slotLook, SPACING_OF_WIDTH, stepSpring, ufoFlight, wrapOffset, type UfoPhase } from './ufo-carousel';

const FOV = 30;
/** 真ん中の船の直径（箱の高さ・幅に対する割合） */
const SIZE_OF_HEIGHT = 0.95;
const SIZE_OF_WIDTH = 0.36;
/** 船を斜め上から見る角度（ラジアン） */
const TILT = 0.42;
/** 滑って動くばねの速さ（rad/s）。大きいほど速く着く */
const SPRING_OMEGA = 11;
/** 光の筋の長さ（船の直径に対する倍率）：止まっているとき 0、最も速いとき最大 */
const STREAK_MAX = 11;

interface Item {
  hull: HullType;
  model: ShipModel;
  wrap: THREE.Group;
  pivot: THREE.Group;
  streaks: { mesh: THREE.Mesh; amp: ReturnType<typeof uniform>; lengthScale: number; yOffset: number; thickness: number }[];
  /** 出入りの順（左端が 0）。出入りが始まるときに決める */
  rank: number;
}

export class UfoLayer {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 1, 10);
  private readonly items: Item[] = [];
  private readonly owned: { dispose(): void }[] = [];
  private width = 1;
  private height = 1;
  private phase: UfoPhase = 'hidden';
  private phaseStartMs = 0;
  private pos = 0;
  private vel = 0;
  private clockSec = 0;
  private lastRect: { left: number; top: number; width: number; height: number } | null = null;

  constructor(hue: number) {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2, 3, 2.5);
    const rim = new THREE.DirectionalLight(0x74e6ff, 1.2);
    rim.position.set(-3, 1, -2);
    this.scene.add(key, rim);

    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.translate(0.5, 0, 0); // 船の位置から右（後ろ）へ伸びる
    this.owned.push(geometry);

    for (const hull of HULL_TYPES) {
      const model = createShipModel(hull, hue);
      const wrap = new THREE.Group();
      const pivot = new THREE.Group();
      pivot.rotation.y = -0.6;
      pivot.add(model.group);
      wrap.add(pivot);
      wrap.rotation.x = TILT;
      this.scene.add(wrap);

      const streaks: Item['streaks'] = [];
      // 太さと長さの違う筋を 3 本。光の速さで飛んでいるように見せる
      for (const [yOffset, thickness, lengthScale] of [[0, 0.1, 1], [0.2, 0.035, 0.7], [-0.17, 0.045, 1.25]] as const) {
        const amp = uniform(0);
        const u = uv();
        const along = pow(float(1).sub(u.x), 2.0);
        const across = pow(float(1).sub(u.y.sub(0.5).abs().mul(2)), 1.5);
        const intensity = along.mul(across).mul(amp);
        const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
        material.colorNode = vec3(0.72, 0.9, 1.0).mul(intensity);
        // 背景が透明な画面に光を足す：透明度を光の強さに合わせる（earth-scene.ts の大気と同じ）
        material.opacityNode = intensity;
        material.blending = THREE.CustomBlending;
        material.blendEquation = THREE.AddEquation;
        material.blendSrc = THREE.OneFactor;
        material.blendDst = THREE.OneFactor;
        material.blendSrcAlpha = THREE.OneFactor;
        material.blendDstAlpha = THREE.OneFactor;
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = -1;
        this.scene.add(mesh);
        this.owned.push(material);
        streaks.push({ mesh, amp, lengthScale, yOffset, thickness });
      }
      this.items.push({ hull, model, wrap, pivot, streaks, rank: 0 });
    }
  }

  /** 描く画面の大きさ（css px）。1 ワールド単位 = 1 css px になるよう、カメラを引く */
  setSize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const z = this.height / 2 / Math.tan((FOV * Math.PI) / 360);
    this.camera.aspect = this.width / this.height;
    this.camera.near = z * 0.2;
    this.camera.far = z * 3;
    this.camera.position.set(0, 0, z);
    this.camera.updateProjectionMatrix();
  }

  setHue(hue: number): void {
    for (const it of this.items) it.model.setHue(hue);
  }

  /** 初めて描く前に、シェーダーのコンパイルを済ませる（済ませないと、飛んでくる最初の動きが引っかかる） */
  async compile(renderer: THREE.WebGPURenderer): Promise<void> {
    this.setSize(this.width, this.height);
    for (const it of this.items) it.wrap.visible = true;
    try {
      await renderer.compileAsync(this.scene, this.camera);
    } catch (e) {
      console.warn('宇宙船の描画の準備に失敗。そのまま描く', e);
    }
    for (const it of this.items) {
      it.wrap.visible = false;
      it.streaks.forEach((s) => (s.mesh.visible = false));
    }
  }

  /** 何かを描くか（出入りの途中か、出ているとき） */
  get active(): boolean {
    return this.phase !== 'hidden';
  }

  /**
   * 1 フレーム進める。nowMs：ブラウザの時計（ms）。motion が false なら、回転・揺れ・ばねの滑らかさを止める
   * （飛んでくる動き自体は、選ぶ画面に必要なので残すが、止まった位置へすぐ着く）
   */
  update(stage: TopStage, nowMs: number, dt: number, motion: boolean): void {
    // 消えるときは、箱が先に縮んで見つからなくなるので、最後に見えていた位置を使う
    const fresh = stage.getRect?.() ?? null;
    if (fresh) this.lastRect = fresh;
    const rect = this.lastRect;
    const want = stage.ufoShown && !!fresh;
    // 出る前は、目標の位置に置いておく（読み込んだ船が、飛んでくる前に滑って動くのを見せない）
    if (this.phase === 'hidden') {
      this.pos = stage.target;
      this.vel = 0;
    }
    if (want && (this.phase === 'hidden' || this.phase === 'out')) this.begin('in', nowMs);
    else if (!want && (this.phase === 'in' || this.phase === 'idle')) this.begin('out', nowMs);
    const since = nowMs - this.phaseStartMs;
    if (this.phase === 'in' && since >= flightDuration('in')) this.phase = 'idle';
    else if (this.phase === 'out' && since >= flightDuration('out')) this.phase = 'hidden';

    stage.ufoBusy = this.phase === 'in' || this.phase === 'out';
    if (this.phase === 'hidden' || !rect) {
      for (const it of this.items) {
        it.wrap.visible = false;
        it.streaks.forEach((s) => (s.mesh.visible = false));
      }
      return;
    }
    this.clockSec += dt;

    // 位置：ドラッグ中は指に付け、離したら目標へ、ばねで滑らせる
    const prev = this.pos;
    if (stage.dragPos !== null) {
      this.pos = stage.dragPos;
      this.vel = dt > 0 ? (this.pos - prev) / dt : 0;
    } else if (motion) {
      const s = stepSpring(this.pos, this.vel, stage.target, dt, SPRING_OMEGA);
      this.pos = s.pos;
      this.vel = s.vel;
    } else {
      this.pos = stage.target;
      this.vel = 0;
    }
    stage.pos = this.pos;
    stage.vel = this.vel;
    stage.ufoDrawn = true;

    const diameter = Math.min(rect.height * SIZE_OF_HEIGHT, rect.width * SIZE_OF_WIDTH);
    const spacing = rect.width * SPACING_OF_WIDTH;
    const cx = rect.left + rect.width / 2 - this.width / 2;
    const cy = this.height / 2 - (rect.top + rect.height / 2);
    // 飛んでくる前の位置（画面の右の外）と、消えるときの行き先（画面の左の外）
    const farRight = this.width / 2 + diameter * 0.7;
    const farLeft = -this.width / 2 - diameter * 0.7;

    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const slot = wrapOffset(i - this.pos);
      const look = slotLook(slot);
      const flight = ufoFlight(this.phase, it.rank, since);
      const visible = flight.visible && look.scale > 0.01;
      it.wrap.visible = visible;
      const size = diameter * look.scale;
      const baseX = cx + slot * spacing;
      const x = flight.offset >= 0 ? baseX + flight.offset * (farRight - baseX) : baseX - flight.offset * (farLeft - baseX);
      const bob = motion ? Math.sin(this.clockSec * 1.4 + i * 2.1) * 0.03 * size : 0;
      it.wrap.position.set(x, cy + bob, 0);
      it.wrap.scale.setScalar(size / HULLS[it.hull].lengthKm);
      // 動く向きに傾く（滑っているとき・飛んでいるとき）
      const bank = Math.max(-0.35, Math.min(0.35, this.vel * 0.1)) + flight.speed * 0.3;
      it.wrap.rotation.z = motion ? bank : 0;
      if (motion) it.pivot.rotation.y += dt * (Math.abs(slot) < 0.5 ? 0.7 : 0.3);

      const streak = flight.speed > 0.004 && visible ? flight.speed : 0;
      for (const s of it.streaks) {
        s.mesh.visible = streak > 0;
        if (streak <= 0) continue;
        s.amp.value = Math.min(1, streak * 1.5);
        const len = size * (0.6 + STREAK_MAX * streak) * s.lengthScale;
        s.mesh.scale.set(len, size * s.thickness, 1);
        s.mesh.position.set(x, cy + s.yOffset * size, -size * 0.6);
      }
    }
  }

  /** phase の始まり。出入りの順は、いまの並びの左から（左端の船がいちばん遠くまで飛ぶので、先に動かす） */
  private begin(phase: 'in' | 'out', nowMs: number): void {
    this.phase = phase;
    this.phaseStartMs = nowMs;
    const order = this.items
      .map((_, i) => ({ i, slot: wrapOffset(i - this.pos) }))
      .sort((a, b) => a.slot - b.slot);
    order.forEach((o, rank) => (this.items[o.i].rank = rank));
  }

  dispose(): void {
    for (const it of this.items) it.model.dispose();
    this.owned.forEach((o) => o.dispose());
  }
}
