/**
 * タイトル画面のホイールのスクロール（2026-11-06）。最初の画面と詳細の間も、詳細の中も、ここで動かす。
 * 指のスクロール（スマホ）とキーボードは、ブラウザと CSS の scroll-snap（top.css）に任せる。
 *
 * - **1 つの動きで動かす**：行き先（target）を 1 つ持ち、位置はそこへ、速さを持って近づく。2 つの画面の境目で、動きを切り替えない。
 *   切り替えていたころは、詳細の先頭で約 0.3〜0.6 秒止まり、そのあとブラウザのスクロールへ移るときにカクついた（devlog 2026-11-06-title-scroll-smooth）
 * - **速さに上限がある**（MAX_SPEED）。どれだけ強く回しても超えない。行き先が今の位置より先へ行きすぎないようにもするので（MAX_LEAD）、手を止めれば、すぐ止まる
 * - **最初の画面では、少し回しただけでも、隣の画面の先頭まで動く**。1 回の操作（フリック）の余韻で詳細まで流れないよう、
 *   同じ操作の続きは、CARRY_HOLD 分だけ、詳細の先頭で受け止める。新しい操作なら、受け止めず、止まらずに通り過ぎる
 */

/** ホイールの回転量（px）に掛ける数。少し遅くする（オーナーの指示）。見た目のための値 */
export const WHEEL_SCALE = 0.8;
/** 動きの強さ（rad/s）。大きいほど、行き先へ速く追いつく。見た目のための値 */
export const SPRING_OMEGA = 8;
/** 速さの上限（px/s）。これを超えて動かない（オーナーの指示）。見た目のための値 */
export const MAX_SPEED = 1200;
/** 速くなるときの加速の上限（px/s²）。動き出しが急にならないように。減速には効かない */
export const MAX_ACCEL = 7000;
/**
 * 行き先を、今の位置からどこまで先に置けるか（px）。上限の速さで動いているときの、ばねの遅れと同じ長さ。
 * 短いと、上限の速さに届かない。長いと、手を止めたあとも流れ続ける
 */
export const MAX_LEAD = (2 * MAX_SPEED) / SPRING_OMEGA;
/** 同じ操作の続きを、詳細の先頭で受け止める量（px）。これを超えて回し続けると、止まらずに通り過ぎる */
export const CARRY_HOLD = 500;
/** 2 つの画面の先頭にいるとみなす幅（px） */
const EDGE = 2;
/** 動き出しの速さ（px/s）：回転量（px）の何倍か、と、その下限（上限は MAX_SPEED） */
const KICK_PER_PX = 4;
const KICK_MIN = 250;
/** 止まったとみなす、行き先までの距離（px）と、速さ（px/s） */
const SETTLE_DISTANCE = 0.4;
const SETTLE_SPEED = 4;
/** 画面の間を動いている途中で、逆向きに回して向きを変えるのに要る、回転量（px）。余韻の細かい揺れで、向きが変わらないように */
const REVERSE_MIN_PX = 30;
/** ホイールの間がこれ（ms）より空いたら、新しい操作とみなす */
const GESTURE_GAP_MS = 120;

/** 動き出しの速さ（px/s）。回転量 deltaY が大きいほど速く。符号は向き */
export function kickVelocity(deltaY: number): number {
  const mag = Math.min(MAX_SPEED, Math.max(KICK_MIN, Math.abs(deltaY) * KICK_PER_PX));
  return deltaY < 0 ? -mag : mag;
}

/**
 * 臨界減衰のばねを dt 秒進める（厳密な解。dt が大きくても、壊れない）。
 * x：いまの位置、v：速さ（px/s）、target：行き先。行き先に向かって、速さを持ったまま近づき、行き過ぎずに止まる
 */
export function stepSpring(x: number, v: number, target: number, dt: number, omega = SPRING_OMEGA): { x: number; v: number } {
  const y = x - target;
  const b = v + omega * y;
  const e = Math.exp(-omega * dt);
  const yNew = (y + b * dt) * e;
  const vNew = (b - omega * (y + b * dt)) * e;
  return { x: target + yNew, v: vNew };
}

/** ばねを dt 秒進める。ただし、速さは maxSpeed を超えず、速くなるときの加速は maxAccel を超えない。減速は、ばねのまま */
export function stepLimited(x: number, v: number, target: number, dt: number, maxSpeed = MAX_SPEED, maxAccel = MAX_ACCEL): { x: number; v: number } {
  const s = stepSpring(x, v, target, dt);
  let nv = s.v;
  // 同じ向きに速くなるときだけ、加速を抑える（向きを変える途中は、ばねのまま）
  if (nv * v >= 0 && Math.abs(nv) > Math.abs(v)) {
    const allowed = Math.abs(v) + maxAccel * dt;
    if (Math.abs(nv) > allowed) nv = Math.sign(nv) * allowed;
  }
  if (Math.abs(nv) > maxSpeed) nv = Math.sign(nv) * maxSpeed;
  if (nv === s.v) return s;
  return { x: x + ((v + nv) / 2) * dt, v: nv };
}

/** ホイールの操作の見分け：いま続いている操作の記録 */
export interface WheelGesture {
  lastMs: number;
  sign: number;
  /** 操作の中で一番大きかった回転量 */
  peak: number;
  /** 一番大きかったあとの、一番小さかった回転量 */
  low: number;
}

/**
 * このホイールが、新しい操作の始まりかどうかを見分ける。間が空いた・向きが変わった・減っていた回転量がまた増えた（余韻の途中で、もう一度回した）なら、新しい操作。
 * トラックパッドは、指を離したあとも、減っていく回転量（余韻）を送り続けるので、それを新しい操作と数えないため
 */
export function trackGesture(g: WheelGesture | null, deltaY: number, nowMs: number): { gesture: WheelGesture; isNew: boolean } {
  const abs = Math.abs(deltaY);
  const sign = Math.sign(deltaY);
  const fresh = { lastMs: nowMs, sign, peak: abs, low: abs };
  if (!g || nowMs - g.lastMs > GESTURE_GAP_MS || sign !== g.sign) return { gesture: fresh, isNew: true };
  // 立ち上がりの増加は、新しい操作にしない（山から十分に減ったあとの増加だけ）
  if (g.low <= g.peak * 0.6 && abs >= Math.max(g.low * 2, g.low + 8)) return { gesture: fresh, isNew: true };
  if (abs >= g.peak) return { gesture: { lastMs: nowMs, sign, peak: abs, low: abs }, isNew: false };
  return { gesture: { lastMs: nowMs, sign, peak: g.peak, low: Math.min(g.low, abs) }, isNew: false };
}

/** 行き先と、詳細の先頭で受け止める残り */
export interface ScrollAim {
  target: number;
  hold: number;
}

/**
 * ホイールを回したときの、次の行き先を決める。x：いまの位置、dy：回転量（WHEEL_SCALE を掛けたあと）、
 * isNew：新しい操作か、hero：最初の画面の高さ（＝詳細の先頭の位置）、max：スクロールの一番下の位置
 */
export function aimWheel(aim: ScrollAim, x: number, dy: number, isNew: boolean, hero: number, max: number): ScrollAim {
  const { target } = aim;
  // 新しい操作は、受け止めない（止まらずに通り過ぎる）
  let hold = isNew ? 0 : aim.hold;
  const atHead = Math.abs(target - hero) <= EDGE;

  if (dy > 0) {
    // 最初の画面（または間）から：少し回しただけでも、詳細の先頭へ。同じ操作の続きは、そこで受け止める
    if (target < hero - EDGE) return { target: hero, hold: CARRY_HOLD };
    let rest = dy;
    if (atHead && hold > 0) {
      const used = Math.min(hold, rest);
      hold -= used;
      rest -= used;
      if (rest <= 0) return { target, hold };
    }
    const reach = Math.max(target, x + MAX_LEAD);
    return { target: Math.min(max, Math.min(target + rest, reach)), hold };
  }

  if (dy < 0) {
    // 最初の画面の先頭より上は無い
    if (target <= 0) return { target: 0, hold };
    // 2 つの画面の間からは、最初の画面へ
    if (target < hero - EDGE) return { target: 0, hold: 0 };
    let rest = -dy;
    if (!atHead) {
      // 詳細の中：回した分だけ戻る。先頭に届いたら、余った分は、受け止めに回す
      const next = Math.max(target - rest, Math.min(target, x - MAX_LEAD));
      if (next > hero) return { target: next, hold };
      rest = hero - next;
      hold = CARRY_HOLD;
    }
    // 受け止めきれない（新しい操作、または、回し続けた）なら、止まらずに最初の画面へ
    if (rest < hold) return { target: hero, hold: hold - rest };
    return { target: 0, hold: 0 };
  }
  return { target, hold };
}

/** root にホイールの動きを付ける。外すときの関数を返す */
export function attachSectionWheel(root: HTMLElement, heroHeight: () => number): () => void {
  let anim: { x: number; v: number; last: number } | null = null;
  let aim: ScrollAim = { target: 0, hold: 0 };
  let gesture: WheelGesture | null = null;
  let raf = 0;

  /** 動きを止める（吸い付きを戻す） */
  const end = () => {
    cancelAnimationFrame(raf);
    anim = null;
    root.classList.remove('is-gliding');
  };

  const frame = (now: number) => {
    if (!anim) return;
    // フレームが遅れても、速さが変わらないように、実際に経った時間で進める。最初のフレームは 1 フレーム分
    const dt = anim.last < 0 ? 1 / 60 : Math.min(0.1, Math.max(0.001, (now - anim.last) / 1000));
    anim.last = now;
    const s = stepLimited(anim.x, anim.v, aim.target, dt);
    anim.x = s.x;
    anim.v = s.v;
    if (Math.abs(s.x - aim.target) < SETTLE_DISTANCE && Math.abs(s.v) < SETTLE_SPEED) {
      root.scrollTop = aim.target;
      end();
      return;
    }
    root.scrollTop = s.x;
    raf = requestAnimationFrame(frame);
  };

  const onWheel = (e: WheelEvent) => {
    // ピンチ（拡大・縮小）と横のスクロールは、そのまま
    if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const raw = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * root.clientHeight : e.deltaY;
    e.preventDefault();
    // ごく小さな揺れでは動かさない
    if (Math.abs(raw) < 1) return;
    const hero = heroHeight();
    const max = Math.max(hero, root.scrollHeight - root.clientHeight);
    const x = anim ? anim.x : root.scrollTop;
    if (!anim) aim.target = x;

    // 画面の間を動いている途中の、逆向きの細かい揺れ（余韻）は捨てる
    const towardTarget = Math.sign(aim.target - x);
    if (anim && x < hero - EDGE && towardTarget !== 0 && Math.sign(raw) !== towardTarget && Math.abs(raw) < REVERSE_MIN_PX) return;

    const tracked = trackGesture(gesture, raw, e.timeStamp);
    gesture = tracked.gesture;
    const before = aim.target;
    aim = aimWheel(aim, x, raw * WHEEL_SCALE, tracked.isNew, hero, max);
    if (aim.target === before) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.scrollTop = aim.target;
      return;
    }
    if (!anim) {
      // 動いている間は、CSS の吸い付きを切る（切らないと、1 フレームごとに、近い画面の先頭へ引き戻される）
      root.classList.add('is-gliding');
      // 2 つの画面の間を動くときだけ、回した強さで動き出す（詳細の中は、回した分だけ動く）
      const crossing = x < hero - EDGE || aim.target < hero - EDGE;
      anim = { x, v: crossing ? kickVelocity(raw) : 0, last: -1 };
      raf = requestAnimationFrame(frame);
    }
  };

  // 指・ポインターで触れたり、キーを押したら、動きをやめる（その操作を、ブラウザに任せる）
  const interrupt = () => end();
  root.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('touchstart', interrupt, { passive: true });
  root.addEventListener('pointerdown', interrupt, { passive: true });
  window.addEventListener('keydown', interrupt);
  return () => {
    end();
    root.removeEventListener('wheel', onWheel);
    root.removeEventListener('touchstart', interrupt);
    root.removeEventListener('pointerdown', interrupt);
    window.removeEventListener('keydown', interrupt);
  };
}
