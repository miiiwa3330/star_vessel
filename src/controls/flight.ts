/**
 * 一人称の操縦（仮）。要件 F7 の「近くは速さを連続で上げ下げして自分で操縦する」に、マインクラフトの操作感を真似た形（要件 F60）。
 * 動き方の計算（慣性・ダッシュ）は src/controls/movement.ts。
 *
 * PC：画面をクリックすると、マウスのカーソルが消え（Pointer Lock）、マウスを動かすだけで向きが変わる。Esc でカーソルが戻り、
 *     ゲームメニューが出る（入ったばかりのときは出さず、クリックを待つ）。レーダー（R）・マップ（M）・チャット（Enter・T）・下のボタン（1〜6）を
 *     開くと、カーソルが出て、閉じると操縦に戻る。W/S で前後、A/D で左右（いま見ている視点の向きにそのまま進む）、
 *     Space で上昇、Shift で下降（いま見ている視点の上下に沿って動く）、
 *     W の 2 回押しか Ctrl でダッシュ、Q/E で傾き、ホイールか +/− で速さ（Ctrl か Shift を押しながら +/− で 10 倍ずつ・
 *     Ctrl＋ホイールで 10 倍ずつ）、クリックで照準の先の天体を選ぶ
 * スマホ：1 本指のドラッグで向きを変える。左下の十字のボタンで前後左右、右下のボタンで上昇・下降（前のボタンの 2 回押しでダッシュ）
 * 視点（src/controls/chase-camera.ts）：F5 か V キーで、一人称 → 後ろから → 前から と切り替える。三人称では、右ボタンを押しながら
 *     マウスを動かすと船のまわりを回り、Alt＋ホイールで距離を変える。スマホは画面のボタンで切り替え、「カメラを回す」のときは
 *     1 本指のドラッグで回る
 */
import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import type { Vec3 } from '../world/vec';
import { MAX_SPEED_KM_S } from '../world/ship-schema';
import { SPRINT_FACTOR, approachVelocity, isDoubleTap, moveInput, nextSprint, settle } from './movement';

const LOOK_RAD_PER_PX = 0.003;
const ROLL_RAD_PER_S = 1.2;
const SPEED_STEP = 1.25;
export const MIN_SPEED_KM_S = 0.1;
/** 手で操縦する速さの上限（要件 F17・仮）は ship-schema.ts の MAX_SPEED_KM_S。サーバーも同じ値で確かめる */
export { MAX_SPEED_KM_S };
/** Ctrl（か Shift）を押しながらだと、1 段で速さを 10 倍にする（秒速 500 km から上限まで、約 13 段） */
const FAST_SPEED_STEP = 10;
/** Pointer Lock の直後などに、マウスの動きがまとめて大きく届くことがある（ブラウザの不具合）。これより大きい 1 回の動きは捨てる */
const MAX_LOCKED_MOVE_PX = 400;
/** 止まろうとしていて、目標の速さのこの割合より遅くなったら止める */
const SETTLE_FRACTION = 1e-3;

export class FlightControls {
  /** 船・視点の向き。カメラは −Z の向きを見る。W/A/S/D・Space/Shift はこの向きを基準に動く */
  readonly orientation = new Quaternion();
  speedKmS = 500;
  /** いまの速度（km/s・EQJ）。慣性があるので、キーを離してもすぐには 0 にならない */
  private velocity: Vec3 = { x: 0, y: 0, z: 0 };
  private sprinting = false;
  private lastForwardPressMs = -Infinity;
  private doubleTapped = false;
  /** 1 本指（左ボタン）のドラッグで、船の向きを変えるか、カメラを回すか（スマホの三人称で使う） */
  dragMode: 'steer' | 'orbit' = 'steer';
  /** カメラを回す（右ボタン＋マウス・dragMode が orbit のときのドラッグ）。回したら true（一人称では回さず、向きを変える）。main.ts が入れる */
  onOrbit: (dxPx: number, dyPx: number) => boolean = () => false;
  /** カメラの距離を変える（Alt＋ホイール） */
  onZoom: (steps: number) => void = () => {};
  /** 視点を切り替える（F5・V キー） */
  onToggleView: () => void = () => {};
  onToggleConstellations: () => void = () => {};
  /** 左上の表示（座標など）を出す・消す（F3 キー） */
  onToggleStatus: () => void = () => {};
  /** チャットの入力欄を開く（Enter・T キー） */
  onOpenChat: () => void = () => {};
  /** レーダーを大きくする・戻す（R キー。2026-11-12 に M から変えた。M は 3D のマップ） */
  onToggleRadar: () => void = () => {};
  /** 3D のマップを開く・閉じる（M キー） */
  onToggleMap: () => void = () => {};
  /** 下のボタン（ホットバー）を押す（1〜6 キー。マインクラフトと同じく数字で選ぶ） */
  onHotbar: (n: number) => void = () => {};
  /** F2：写真を撮る（マインクラフトと同じキー） */
  onPhoto: () => void = () => {};
  /** カーソルが出ているときに Esc を押した（開いている画面を閉じる・ゲームメニューを出す） */
  onEscape: () => void = () => {};
  /** ほとんど動かさずに離した（クリック・タップ）。画面の座標（CSS ピクセル）。main.ts が入れる */
  onTap: (x: number, y: number) => void = () => {};
  /** 操縦しているときに、Esc でカーソルが戻った（自分で exitLock したときは呼ばない）。ゲームメニューを出す。PC だけ */
  onUserUnlock: () => void = () => {};
  /** カーソルを消した・戻した。usesLock はカーソルを消して操縦する端末か（タッチすると false になる） */
  onLockState: (locked: boolean, usesLock: boolean) => void = () => {};
  /** カーソルを消せなかった（Esc のすぐ後など） */
  onLockError: () => void = () => {};
  /** 画面（ゲームメニュー・マップ・チャットなど）が開いているか。開いている間は操縦せず、カーソルも消さない。main.ts が入れる */
  isBlocked: () => boolean = () => false;
  /** マウスのカーソルを消して操縦するか（PC）。スマホ・Pointer Lock が使えないブラウザでは false で、ドラッグで向きを変える */
  private usesLock: boolean;
  private locked = false;
  /** exitLock で自分からカーソルを戻したところか（ゲームメニューを出さない） */
  private quietUnlock = false;
  /** 最後にカーソルが戻った時刻。Esc でカーソルが戻ったのと同じ Esc のキーを、もう一度数えないため */
  private unlockedAt = -Infinity;
  /** 押した位置と、そこから動いた量（タップか、ドラッグかを見分ける） */
  private press: { x: number; y: number; moved: number; button: number } | null = null;
  private readonly keys = new Set<string>();
  /** 画面のボタン（スマホの十字のボタン）で押しているキー */
  private readonly virtualKeys = new Set<string>();
  private readonly allKeys = new Set<string>();
  /** ドラッグしている指・ボタン（スマホで、十字のボタンを押しながら別の指で向きを変えられるよう、1 本だけ追う） */
  private dragging: { id: number; x: number; y: number; orbit: boolean } | null = null;
  private readonly q = new Quaternion();
  private readonly axis = new Vector3();
  private readonly dir = new Vector3();
  private readonly upVec = new Vector3();

  constructor(private readonly element: HTMLElement) {
    this.usesLock = 'requestPointerLock' in element && window.matchMedia('(pointer: fine)').matches;
    element.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.releaseAll());
    window.addEventListener('click', this.onClick, true);
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', () => this.onLockError());
    // 操縦中に Ctrl＋W（Windows ではタブを閉じる）などを押して、うっかり閉じないように確かめる
    window.addEventListener('beforeunload', (e) => {
      if (!this.locked) return;
      e.preventDefault();
      e.returnValue = '';
    });
    // 右ボタンでカメラを回すので、右クリックのメニューを出さない
    element.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** マウスのカーソルを消して操縦する端末か（PC） */
  get usesPointerLock(): boolean {
    return this.usesLock;
  }

  /** カーソルを消して操縦に戻る（ゲームメニューの「ゲームに戻る」など。押したときの処理の中で呼ぶ） */
  requestLock(): void {
    if (!this.usesLock || this.locked || this.isBlocked()) return;
    try {
      // 古い Safari は Promise を返さない
      const r = this.element.requestPointerLock() as unknown as Promise<void> | undefined;
      r?.catch?.(() => this.onLockError());
    } catch {
      this.onLockError();
    }
  }

  /** カーソルを戻す（マップ・チャットなどを開くとき）。ゲームメニューは出さない */
  exitLock(): void {
    if (!this.locked) return;
    this.quietUnlock = true;
    document.exitPointerLock();
  }

  /** target の方を、up を上にして向く（target・up は EQJ） */
  lookAt(target: Vec3, up: Vec3): void {
    const m = new Matrix4().lookAt(new Vector3(0, 0, 0), new Vector3(target.x, target.y, target.z), new Vector3(up.x, up.y, up.z));
    this.orientation.setFromRotationMatrix(m);
  }

  /** 慣性で滑っているのを止める（ワープ・瞬間移動のあと） */
  stop(): void {
    this.velocity = { x: 0, y: 0, z: 0 };
  }

  /** 自分の見ている向き（EQJ の単位ベクトル。カメラの −Z） */
  forward(): Vec3 {
    const v = new Vector3(0, 0, -1).applyQuaternion(this.orientation);
    return { x: v.x, y: v.y, z: v.z };
  }

  /** 自分の見ている上の向き（EQJ の単位ベクトル。カメラの +Y） */
  up(): Vec3 {
    const v = new Vector3(0, 1, 0).applyQuaternion(this.orientation);
    return { x: v.x, y: v.y, z: v.z };
  }

  /** 画面のボタン（スマホの十字のボタン・上昇・下降）でキーを押す・離す。code は KeyboardEvent.code と同じ */
  setVirtualKey(code: string, down: boolean): void {
    if (down) {
      if (!this.virtualKeys.has(code)) this.pressed(code);
      this.virtualKeys.add(code);
    } else this.virtualKeys.delete(code);
  }

  /** dt 秒ぶん操作を進め、動いた量（km・EQJ）を返す */
  update(dt: number): Vec3 {
    const roll = (this.keys.has('KeyQ') ? 1 : 0) - (this.keys.has('KeyE') ? 1 : 0);
    if (roll !== 0) this.rotateLocal(0, 0, 1, roll * ROLL_RAD_PER_S * dt);

    this.allKeys.clear();
    this.keys.forEach((k) => this.allKeys.add(k));
    this.virtualKeys.forEach((k) => this.allKeys.add(k));
    const input = moveInput(this.allKeys);
    const ctrl = this.keys.has('ControlLeft') || this.keys.has('ControlRight');
    this.sprinting = nextSprint(this.sprinting, input, ctrl, this.doubleTapped);
    this.doubleTapped = false;

    // 目標の速度：いま見ている視点の向き（orientation）をそのまま前後・左右・上下にする
    const speed = this.speedKmS * (this.sprinting ? SPRINT_FACTOR : 1);
    this.dir.set(input.right, input.up, -input.forward);
    if (this.dir.lengthSq() > 0) this.dir.normalize().applyQuaternion(this.orientation).multiplyScalar(speed);
    const target = { x: this.dir.x, y: this.dir.y, z: this.dir.z };
    this.upVec.set(0, 1, 0).applyQuaternion(this.orientation);
    const next = approachVelocity(this.velocity, target, this.upVec, dt);
    this.velocity = settle(next, target, this.speedKmS * SETTLE_FRACTION);
    return { x: this.velocity.x * dt, y: this.velocity.y * dt, z: this.velocity.z * dt };
  }

  /** ダッシュしているか（画面の表示用） */
  get isSprinting(): boolean {
    return this.sprinting;
  }

  /** 速さを steps 段変える。fast なら 1 段で 10 倍 */
  changeSpeed(steps: number, fast = false): void {
    const step = fast ? FAST_SPEED_STEP : SPEED_STEP;
    this.speedKmS = Math.min(MAX_SPEED_KM_S, Math.max(MIN_SPEED_KM_S, this.speedKmS * step ** steps));
  }

  /** マウス・指の動き（ピクセル）だけ視点の向きを直接変える */
  private look(dxPx: number, dyPx: number): void {
    this.rotateLocal(0, 1, 0, -dxPx * LOOK_RAD_PER_PX);
    this.rotateLocal(1, 0, 0, -dyPx * LOOK_RAD_PER_PX);
  }

  private rotateLocal(x: number, y: number, z: number, angle: number) {
    this.q.setFromAxisAngle(this.axis.set(x, y, z), angle);
    this.orientation.multiply(this.q).normalize();
  }

  /** キーを押した瞬間（キーボードと画面のボタンで共通）。W の 2 回押しを見分ける */
  private pressed(code: string) {
    if (code !== 'KeyW') return;
    const now = performance.now();
    if (isDoubleTap(this.lastForwardPressMs, now)) this.doubleTapped = true;
    this.lastForwardPressMs = now;
  }

  private releaseAll() {
    this.keys.clear();
    this.virtualKeys.clear();
    this.dragging = null;
    this.press = null;
  }

  private onLockChange = () => {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.element;
    this.releaseAll();
    if (was && !this.locked) {
      this.unlockedAt = performance.now();
      if (!this.quietUnlock && this.usesLock) this.onUserUnlock();
    }
    this.quietUnlock = false;
    this.onLockState(this.locked, this.usesLock);
  };

  /** 操縦のキー・マウスを受け付けるか（画面が開いておらず、PC ではカーソルを消している） */
  private get flying(): boolean {
    return !this.isBlocked() && (this.locked || !this.usesLock);
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.usesLock && e.pointerType === 'mouse') {
      if (!this.locked) {
        // カーソルが出ているときに画面をクリックすると、操縦をはじめる（画面が開いている間は、その画面がクリックを受ける）
        if (e.button === 0) this.requestLock();
        return;
      }
      // カーソルを消している間のクリックは、照準（画面の真ん中）の先を選ぶ
      if (e.button === 0) this.onTap(window.innerWidth / 2, window.innerHeight / 2);
      return;
    }
    // マウスとタッチの両方がある端末で、タッチしたら、カーソルを消す操縦をやめる（ドラッグで向きを変える）
    if (this.usesLock && e.pointerType !== 'mouse') {
      this.usesLock = false;
      this.onLockState(this.locked, false);
    }
    if (this.dragging) return;
    this.dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, orbit: e.button === 2 || this.dragMode === 'orbit' };
    this.press = { x: e.clientX, y: e.clientY, moved: 0, button: e.button };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.locked && e.pointerType === 'mouse') {
      if (Math.abs(e.movementX) > MAX_LOCKED_MOVE_PX || Math.abs(e.movementY) > MAX_LOCKED_MOVE_PX) return;
      // 右ボタンを押している間は、カメラを回す（一人称では回さず、向きを変える）
      if ((e.buttons & 2) !== 0 && this.onOrbit(e.movementX, e.movementY)) return;
      this.look(e.movementX, e.movementY);
      return;
    }
    if (!this.dragging || e.pointerId !== this.dragging.id) return;
    const dx = e.clientX - this.dragging.x;
    const dy = e.clientY - this.dragging.y;
    this.dragging = { ...this.dragging, x: e.clientX, y: e.clientY };
    if (this.press) this.press.moved += Math.abs(dx) + Math.abs(dy);
    if (this.dragging.orbit && this.onOrbit(dx, dy)) return;
    this.look(dx, dy);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.dragging || e.pointerId !== this.dragging.id) return;
    const p = this.press;
    this.dragging = null;
    this.press = null;
    // 6 px より動かしていなければ、クリック・タップとみなす（左ボタン・指だけ）
    if (p && e.type === 'pointerup' && p.button === 0 && p.moved < 6) this.onTap(p.x, p.y);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!this.flying) return;
    if (e.altKey) this.onZoom(e.deltaY < 0 ? 1 : -1);
    // Shift はいま下降なので、10 倍ずつは Ctrl（Shift＋ホイールも残す。Mac では横のスクロールになるので deltaX も見る）
    else {
      const d = e.deltaY !== 0 ? e.deltaY : e.deltaX;
      if (d !== 0) this.changeSpeed(d < 0 ? 1 : -1, e.ctrlKey || e.shiftKey);
    }
  };

  /**
   * マウスや指で押したボタンからフォーカスを外す。残っていると、次の Space が上昇ではなくそのボタンをもう一度押してしまう。
   * キーボードで押したとき（detail が 0）は外さない（Tab で選んで Space で押す操作を続けられるように）
   */
  private onClick = (e: MouseEvent) => {
    if (e.detail === 0) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.tagName === 'BUTTON') active.blur();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    // 文字を入れている間（チャットの入力欄）は、キーを操縦に使わない
    if (isTyping(e.target)) return;
    if (e.code === 'F2') {
      e.preventDefault();
      if (!e.repeat) this.onPhoto();
      return;
    }
    if (e.code === 'F3') {
      e.preventDefault(); // ブラウザの検索を出さない
      if (!e.repeat) this.onToggleStatus();
      return;
    }
    // 操縦中の Esc はブラウザがカーソルを戻すのに使う（ページには届かないことがある）。カーソルが出ているときの Esc だけ使う
    if (e.code === 'Escape') {
      if (!this.locked && performance.now() - this.unlockedAt > 300) {
        e.preventDefault();
        this.onEscape();
      }
      return;
    }
    const plain = !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey;
    // マップ・レーダー・下のボタンは、ほかの画面を開いている間も切り替えられる（ゲームメニューの間は main.ts が受け付けない）
    if (e.code === 'KeyM' && plain) {
      this.onToggleMap();
      return;
    }
    if (e.code === 'KeyR' && plain) {
      this.onToggleRadar();
      return;
    }
    const digit = /^(?:Digit|Numpad)([1-6])$/.exec(e.code);
    if (digit && plain) {
      this.onHotbar(Number(digit[1]));
      return;
    }
    // 画面が開いている間は操縦しない（ボタンを Tab と Space で押せるように、ブラウザに任せる）
    if (this.isBlocked()) return;
    // カーソルが出ていても（入ったばかり・カーソルを消せなかったとき）、チャットは開ける
    if ((e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'KeyT') && plain) {
      // 押した文字が、開いた入力欄に入らないように
      e.preventDefault();
      this.releaseAll();
      this.onOpenChat();
      return;
    }
    if (!this.flying) return;
    if (e.code === 'Space') {
      // Tab で選んだボタンの上では、ふつうにそのボタンを押す
      if (e.target instanceof HTMLElement && e.target.tagName === 'BUTTON') return;
      e.preventDefault(); // Space でページが動かないように
    }
    // 操縦中は、Ctrl＋キー（ブックマーク・保存など）をブラウザに渡さない（Ctrl＋W などブラウザが譲らないものは、閉じる前に確かめる）
    if (this.locked && (e.ctrlKey || e.code === 'F5')) e.preventDefault();
    if (e.code === 'F5') {
      e.preventDefault(); // 読み込み直さない
      if (!e.repeat) this.onToggleView();
    } else if (e.key === '+' || e.key === '=' || e.key === ']') this.changeSpeed(1, e.shiftKey || e.ctrlKey);
    else if (e.key === '-' || e.key === '_' || e.key === '[') this.changeSpeed(-1, e.shiftKey || e.ctrlKey);
    else if (e.code === 'KeyV' && !e.repeat) this.onToggleView();
    else if (e.code === 'KeyC' && !e.repeat && !e.ctrlKey) this.onToggleConstellations();
    else {
      if (!e.repeat && !this.keys.has(e.code)) this.pressed(e.code);
      this.keys.add(e.code);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
}

/** 文字を入れる欄の中のキーか */
function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}
