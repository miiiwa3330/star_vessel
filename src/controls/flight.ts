/**
 * 一人称の操縦（仮）。要件 F7 の「近くは速さを連続で上げ下げして自分で操縦する」の最初の形。
 *
 * PC：ドラッグで向きを変える、W/S で前後、A/D で左右、R/F で上下、Q/E で傾き、
 *     ホイールか +/− で速さを変える
 * スマホ：1 本指のドラッグで向きを変える、2 本指で触れている間は前に進む
 */
import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import type { Vec3 } from '../world/vec';

const LOOK_RAD_PER_PX = 0.003;
const ROLL_RAD_PER_S = 1.2;
const SPEED_STEP = 1.25;
export const MIN_SPEED_KM_S = 0.1;
/** 約 1 光年／秒。銀河を渡るのはワープ（未実装）の役目なので、手で操縦する速さはここまで */
export const MAX_SPEED_KM_S = 9.46e12;

export class FlightControls {
  readonly orientation = new Quaternion();
  speedKmS = 500;
  private readonly keys = new Set<string>();
  private dragging: { x: number; y: number } | null = null;
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

  private changeSpeed(steps: number) {
    this.speedKmS = Math.min(MAX_SPEED_KM_S, Math.max(MIN_SPEED_KM_S, this.speedKmS * SPEED_STEP ** steps));
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch' && this.touches >= 2) return;
    this.dragging = { x: e.clientX, y: e.clientY };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging || this.touches >= 2) return;
    const dx = e.clientX - this.dragging.x;
    const dy = e.clientY - this.dragging.y;
    this.dragging = { x: e.clientX, y: e.clientY };
    this.rotateLocal(0, 1, 0, -dx * LOOK_RAD_PER_PX);
    this.rotateLocal(1, 0, 0, -dy * LOOK_RAD_PER_PX);
  };

  private onPointerUp = () => {
    this.dragging = null;
  };

  private onTouch = (e: TouchEvent) => {
    this.touches = e.touches.length;
    if (this.touches >= 2) this.dragging = null;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.changeSpeed(e.deltaY < 0 ? 1 : -1);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === '+' || e.key === '=' || e.key === ']') this.changeSpeed(1);
    else if (e.key === '-' || e.key === '[') this.changeSpeed(-1);
    else this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
}
