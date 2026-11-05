/**
 * タイトル画面の、2 つの画面（最初の画面と詳細）の間のスクロール（2026-11-06）。
 * CSS の scroll-snap（top.css）で、止まるのは、どちらかの画面の先頭だけにしてあるが、マウスのホイールを少し回しただけだと、
 * ブラウザは「近い方」へ吸い付くので、元の画面へ戻ってしまうことがある。そこで、ホイールを回した向きに、
 * 1 回の操作で、隣の画面の先頭まで動かす。
 *
 * **慣性**（2026-11-06 にオーナーの指示）：ブラウザの決まった長さの滑らかなスクロールではなく、速度を持つ動きにする。
 * ホイールの強さが、動き出しの速さになり（強く回すほど、勢いよく出る）、行き先へ向かう引く力と、ブレーキ（臨界減衰のばね）で、
 * 行き過ぎずに、なめらかに減速して止まる。動いている途中で逆向きに回すと、いまの速さのまま、向きを変える。
 * 詳細の中でのスクロールは、そのまま（ブラウザに任せる）。指でのスクロール（スマホ）とキーボードは、ブラウザの吸い付きに任せる。
 */

/** ホイールを回したとき、動かす先（スクロールの位置・px）。ブラウザに任せるときは null。決める部分だけを関数にして、テストする */
export function wheelTarget(scrollTop: number, heroHeight: number, deltaY: number): number | null {
  if (Math.abs(deltaY) < 1) return null;
  const EDGE = 2;
  // 下へ：最初の画面にいるなら、詳細の先頭へ
  if (deltaY > 0 && scrollTop < heroHeight - EDGE) return heroHeight;
  // 上へ：詳細の先頭にいる（または、2 つの画面の間にいる）なら、最初の画面へ。詳細の中にいるなら、ブラウザに任せる
  if (deltaY < 0 && scrollTop > 0 && scrollTop <= heroHeight + EDGE) return 0;
  return null;
}

/** 動きの強さ（rad/s）。大きいほど速く止まる。6.5 で、約 720px の移動が約 1 秒で収まる。見た目のための値 */
export const SPRING_OMEGA = 6.5;
/** 動き出しの速さ（px/s）：ホイールの回転量（px）の何倍か、と、その下限・上限 */
const KICK_PER_PX = 6;
const KICK_MIN = 400;
const KICK_MAX = 2200;
/** 止まったとみなす、行き先までの距離（px）と、速さ（px/s） */
const SETTLE_DISTANCE = 0.4;
const SETTLE_SPEED = 4;
/** 動いている途中で、逆向きに回して向きを変えるのに要る、回転量（px）。トラックパッドの余韻の細かい揺れで、向きが変わらないように */
const REVERSE_MIN_PX = 30;
/** 止まったあとも、ホイールの余韻（トラックパッドの慣性）を捨てる時間（ms）。これが無いと、余韻で、詳細が勝手に動く */
const TAIL_MS = 250;

/** 動き出しの速さ（px/s）。回転量 deltaY が大きいほど速く。符号は向き */
export function kickVelocity(deltaY: number): number {
  const mag = Math.min(KICK_MAX, Math.max(KICK_MIN, Math.abs(deltaY) * KICK_PER_PX));
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

/** root にホイールの動きを付ける。外すときの関数を返す */
export function attachSectionWheel(root: HTMLElement, heroHeight: () => number): () => void {
  let anim: { target: number; x: number; v: number; last: number } | null = null;
  let raf = 0;
  let lockedUntil = 0;

  /** 動きを止める（吸い付きを戻す）。位置は行き先に合わせる */
  const end = (jumpToTarget: boolean) => {
    cancelAnimationFrame(raf);
    if (anim && jumpToTarget) root.scrollTop = anim.target;
    anim = null;
    root.classList.remove('is-gliding');
  };

  const frame = (now: number) => {
    if (!anim) return;
    const dt = Math.min(0.034, Math.max(0.001, (now - anim.last) / 1000));
    anim.last = now;
    const s = stepSpring(anim.x, anim.v, anim.target, dt);
    anim.x = s.x;
    anim.v = s.v;
    root.scrollTop = s.x;
    if (Math.abs(s.x - anim.target) < SETTLE_DISTANCE && Math.abs(s.v) < SETTLE_SPEED) {
      end(true);
      lockedUntil = performance.now() + TAIL_MS;
      return;
    }
    raf = requestAnimationFrame(frame);
  };

  const glide = (target: number, deltaY: number) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      root.scrollTop = target;
      lockedUntil = performance.now() + TAIL_MS;
      return;
    }
    // 動いている間は、CSS の吸い付きを切る（切らないと、1 フレームごとに、近い画面の先頭へ引き戻される）
    root.classList.add('is-gliding');
    anim = { target, x: root.scrollTop, v: kickVelocity(deltaY), last: performance.now() };
    raf = requestAnimationFrame(frame);
  };

  const onWheel = (e: WheelEvent) => {
    // ピンチ（拡大・縮小）はそのまま
    if (e.ctrlKey) return;
    const now = performance.now();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * root.clientHeight : e.deltaY;
    const hero = heroHeight();

    if (anim) {
      // 動いている途中：逆向きに十分回したら、いまの速さのまま、向きを変える。それ以外（同じ向き・細かい揺れ）は捨てる
      e.preventDefault();
      if (Math.abs(dy) >= REVERSE_MIN_PX) {
        const t = wheelTarget(anim.x, hero, dy);
        if (t !== null && t !== anim.target) anim.target = t;
      }
      return;
    }
    if (now < lockedUntil) {
      // 止まった直後の余韻は、2 つの画面の境目の近くだけ捨てる（詳細の中のスクロールは、止めない）
      if (root.scrollTop <= hero + 2) e.preventDefault();
      return;
    }
    const target = wheelTarget(root.scrollTop, hero, dy);
    if (target === null) return;
    e.preventDefault();
    glide(target, dy);
  };

  // 指・ポインターで触れたり、キーを押したら、動きをやめる（その操作を、ブラウザに任せる）
  const interrupt = () => end(false);
  root.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('touchstart', interrupt, { passive: true });
  root.addEventListener('pointerdown', interrupt, { passive: true });
  window.addEventListener('keydown', interrupt);
  return () => {
    end(false);
    root.removeEventListener('wheel', onWheel);
    root.removeEventListener('touchstart', interrupt);
    root.removeEventListener('pointerdown', interrupt);
    window.removeEventListener('keydown', interrupt);
  };
}
