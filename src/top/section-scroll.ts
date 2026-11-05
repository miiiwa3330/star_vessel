/**
 * タイトル画面の、2 つの画面（最初の画面と詳細）の間のスクロール（2026-11-06）。
 * CSS の scroll-snap（top.css）で、止まるのは、どちらかの画面の先頭だけにしてあるが、マウスのホイールを少し回しただけだと、
 * ブラウザは「近い方」へ吸い付くので、元の画面へ戻ってしまうことがある。そこで、ホイールを回した向きに、
 * 1 回の操作で、隣の画面の先頭まで動かす。詳細の中でのスクロールは、そのまま（ブラウザに任せる）。
 * 指でのスクロール（スマホ）とキーボードは、ブラウザの吸い付きに任せる。
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

/** 動かしたあと、ホイールの余韻（トラックパッドの慣性）を捨てる時間（ms）。これが無いと、余韻で、詳細が勝手に動く */
const LOCK_MS = 700;

/** root にホイールの動きを付ける。外すときの関数を返す */
export function attachSectionWheel(root: HTMLElement, heroHeight: () => number): () => void {
  let lockedUntil = 0;
  const onWheel = (e: WheelEvent) => {
    // ピンチ（拡大・縮小）はそのまま
    if (e.ctrlKey) return;
    const now = performance.now();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * root.clientHeight : e.deltaY;
    const hero = heroHeight();
    if (now < lockedUntil) {
      // 動かしている間と、その余韻は、2 つの画面の境目の近くだけ捨てる（詳細の中のスクロールは、止めない）
      if (root.scrollTop <= hero + 2) e.preventDefault();
      return;
    }
    const target = wheelTarget(root.scrollTop, hero, dy);
    if (target === null) return;
    e.preventDefault();
    lockedUntil = now + LOCK_MS;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' });
  };
  root.addEventListener('wheel', onWheel, { passive: false });
  return () => root.removeEventListener('wheel', onWheel);
}
