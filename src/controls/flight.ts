/**
 * 一人称の操縦（仮）。要件 F7 の「近くは速さを連続で上げ下げして自分で操縦する」の最初の形。
 *
 * PC：ドラッグで向きを変える、W/S で前後、A/D で左右、R/F で上下、Q/E で傾き、
 *     ホイールか +/− で速さを変える
 * スマホ：1 本指のドラッグで向きを変える、2 本指で触れている間は前に進む
 * 視点（src/controls/chase-camera.ts）：V キーで一人称と三人称を切り替える。三人称では、右ドラッグで船のまわりを回り、
 *     Alt＋ホイールで距離を変える。スマホは画面のボタンで切り替え、「カメラを回す」のときは 1 本指のドラッグで回る
 */
import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import type { Vec3 } from '../world/vec';
import { MAX_SPEED_KM_S } from '../world/ship-schema';

const LOOK_RAD_PER_PX = 0.003;
const ROLL_RAD_PER_S = 1.2;
const SPEED_STEP = 1.25;
export const MIN_SPEED_KM_S = 0.1;
/** 手で操縦する速さの上限（要件 F17・仮）は ship-schema.ts の MAX_SPEED_KM_S。サーバーも同じ値で確かめる */
export { MAX_SPEED_KM_S };
/** Shift を押しながらだと、1 段で速さを 10 倍にする（秒速 500 km から上限まで、約 13 段） */
const FAST_SPEED_STEP = 10;

export class FlightControls {
  readonly orientation = new Quaternion();
  speedKmS = 500;
  /** 1 本指（左ボタン）のドラッグで、船の向きを変えるか、カメラを回すか（スマホの三人称で使う） */
  dragMode: 'steer' | 'orbit' = 'steer';
  /** カメラを回す（右ドラッグ・dragMode が orbit のときのドラッグ）。main.ts が入れる */
  onOrbit: (dxPx: number, dyPx: number) => void = () => {};
  /** カメラの距離を変える（Alt＋ホイール） */
  onZoom: (steps: number) => void = () => {};
  /** 視点を切り替える（V キー） */
  onToggleView: () => void = () => {};
  onToggleConstellations: () => void = () => {};
  /** ほとんど動かさずに離した（クリック・タップ）。画面の座標（CSS ピクセル）。main.ts が入れる */
  onTap: (x: number, y: number) => void = () => {};
  /** 押した位置と、そこから動いた量（タップか、ドラッグかを見分ける） */
  private press: { x: number; y: number; moved: number; button: number } | null = null;
  private readonly keys = new Set<string>();
  private dragging: { x: number; y: number; orbit: boolean } | null = null;
  private touches = 0;
  private readonly q = new Quaternion();
  private readonly axis = new Vector3();
  private readonly dir = new Vector3();

  constructor(element: HTMLElement) {
    element.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    element.addEventListener('touchstart', this.onTouch, { passive: true });
    element.addEventListener('touchend', this.onTouch, { passive: true });
    element.addEventListener('touchcancel', this.onTouch, { passive: true });
    element.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.keys.clear());
    // 右ドラッグでカメラを回すので、右クリックのメニューを出さない
    element.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** target の方を、up を上にして向く（target・up は EQJ）。カメラは −Z の向きを見る */
  lookAt(target: Vec3, up: Vec3): void {
    const m = new Matrix4().lookAt(
      new Vector3(0, 0, 0),
      new Vector3(target.x, target.y, target.z),
      new Vector3(up.x, up.y, up.z),
    );
    this.orientation.setFromRotationMatrix(m);
  }

  /** 自分の進む向き（EQJ の単位ベクトル。カメラの −Z） */
  forward(): Vec3 {
    const v = new Vector3(0, 0, -1).applyQuaternion(this.orientation);
    return { x: v.x, y: v.y, z: v.z };
  }

  /** 自分の上の向き（EQJ の単位ベクトル。カメラの +Y） */
  up(): Vec3 {
    const v = new Vector3(0, 1, 0).applyQuaternion(this.orientation);
    return { x: v.x, y: v.y, z: v.z };
  }

  /** dt 秒ぶん操作を進め、動いた量（km・EQJ）を返す */
  update(dt: number): Vec3 {
    const roll = (this.keys.has('KeyQ') ? 1 : 0) - (this.keys.has('KeyE') ? 1 : 0);
    if (roll !== 0) this.rotateLocal(0, 0, 1, roll * ROLL_RAD_PER_S * dt);

    const forward = (this.keys.has('KeyW') || this.touches >= 2 ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const right = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const up = (this.keys.has('KeyR') ? 1 : 0) - (this.keys.has('KeyF') ? 1 : 0);
    this.dir.set(right, up, -forward);
    if (this.dir.lengthSq() === 0) return { x: 0, y: 0, z: 0 };
    this.dir.normalize().applyQuaternion(this.orientation).multiplyScalar(this.speedKmS * dt);
    return { x: this.dir.x, y: this.dir.y, z: this.dir.z };
  }

  private rotateLocal(x: number, y: number, z: number, angle: number) {
    this.q.setFromAxisAngle(this.axis.set(x, y, z), angle);
    this.orientation.multiply(this.q).normalize();
  }

  /** 速さを steps 段変える。fast なら 1 段で 10 倍 */
  changeSpeed(steps: number, fast = false): void {
    const step = fast ? FAST_SPEED_STEP : SPEED_STEP;
    this.speedKmS = Math.min(MAX_SPEED_KM_S, Math.max(MIN_SPEED_KM_S, this.speedKmS * step ** steps));
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch' && this.touches >= 2) return;
    this.dragging = { x: e.clientX, y: e.clientY, orbit: e.button === 2 || this.dragMode === 'orbit' };
    this.press = { x: e.clientX, y: e.clientY, moved: 0, button: e.button };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging || this.touches >= 2) return;
    const dx = e.clientX - this.dragging.x;
    const dy = e.clientY - this.dragging.y;
    this.dragging = { ...this.dragging, x: e.clientX, y: e.clientY };
    if (this.press) this.press.moved += Math.abs(dx) + Math.abs(dy);
    if (this.dragging.orbit) {
      this.onOrbit(dx, dy);
      return;
    }
    this.rotateLocal(0, 1, 0, -dx * LOOK_RAD_PER_PX);
    this.rotateLocal(1, 0, 0, -dy * LOOK_RAD_PER_PX);
  };

  private onPointerUp = (e: PointerEvent) => {
    const p = this.press;
    this.dragging = null;
    this.press = null;
    // 6 px より動かしていなければ、クリック・タップとみなす（左ボタン・指だけ）
    if (p && e.type === 'pointerup' && p.button === 0 && p.moved < 6 && this.touches < 2) this.onTap(p.x, p.y);
  };

  private onTouch = (e: TouchEvent) => {
    this.touches = e.touches.length;
    if (this.touches >= 2) {
      this.dragging = null;
      this.press = null;
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (e.altKey) this.onZoom(e.deltaY < 0 ? 1 : -1);
    else this.changeSpeed(e.deltaY < 0 ? 1 : -1, e.shiftKey);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === '+' || e.key === '=' || e.key === ']') this.changeSpeed(1, e.shiftKey);
    else if (e.key === '-' || e.key === '_' || e.key === '[') this.changeSpeed(-1, e.shiftKey);
    else if (e.code === 'KeyV' && !e.repeat) this.onToggleView();
    else if (e.code === 'KeyC' && !e.repeat) this.onToggleConstellations();
    else this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
}
