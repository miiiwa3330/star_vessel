import { describe, expect, it } from 'vitest';
import {
  aimWheel,
  CARRY_HOLD,
  kickVelocity,
  MAX_ACCEL,
  MAX_LEAD,
  MAX_SPEED,
  type ScrollAim,
  SPRING_OMEGA,
  stepLimited,
  stepSpring,
  trackGesture,
  type WheelGesture,
} from './section-scroll';

const H = 720;
const MAX = 2640;
const aim = (target: number, hold = 0): ScrollAim => ({ target, hold });

describe('ホイールの行き先（aimWheel）', () => {
  it('最初の画面で下へ回すと、どれだけ小さくても、詳細の先頭へ動かす', () => {
    for (const dy of [1, 40, 100, 400, 3000]) {
      expect(aimWheel(aim(0), 0, dy, true, H, MAX)).toEqual({ target: H, hold: CARRY_HOLD });
    }
  });

  it('途中（2 つの画面の間）にいても、回した向きの画面へ動かす', () => {
    expect(aimWheel(aim(300), 300, 50, true, H, MAX).target).toBe(H);
    expect(aimWheel(aim(300), 300, -50, true, H, MAX).target).toBe(0);
  });

  it('最初の画面の先頭で上へ回しても、何もしない', () => {
    expect(aimWheel(aim(0), 0, -100, true, H, MAX).target).toBe(0);
  });

  it('同じ操作の続き（余韻）は、詳細の先頭で受け止める', () => {
    let a = aimWheel(aim(0), 0, 100, true, H, MAX);
    for (let i = 0; i < 4; i++) {
      a = aimWheel(a, H, 100, false, H, MAX);
      expect(a.target).toBe(H);
    }
    expect(a.hold).toBe(CARRY_HOLD - 400);
  });

  it('同じ操作でも、回し続けて受け止める量を超えたら、止まらずに通り過ぎる', () => {
    let a = aimWheel(aim(0), 0, 100, true, H, MAX);
    a = aimWheel(a, 600, CARRY_HOLD + 40, false, H, MAX);
    expect(a.target).toBe(H + 40);
    expect(a.hold).toBe(0);
  });

  it('着いた瞬間に新しく回すと、受け止めずに、すぐ詳細の中へ進む（今回の不具合）', () => {
    const arrived = aim(H, CARRY_HOLD - 100);
    // まだ動いている途中でも、着いたあとでも
    expect(aimWheel(arrived, 700, 80, true, H, MAX).target).toBe(H + 80);
    expect(aimWheel(arrived, H, 80, true, H, MAX).target).toBe(H + 80);
  });

  it('詳細の中は、回した分だけ動く（下へも上へも）。一番下より先へは行かない', () => {
    expect(aimWheel(aim(1000), 1000, 80, true, H, MAX).target).toBe(1080);
    expect(aimWheel(aim(1000), 1000, -80, true, H, MAX).target).toBe(920);
    expect(aimWheel(aim(MAX - 10), MAX - 10, 80, true, H, MAX).target).toBe(MAX);
  });

  it('行き先は、今の位置から MAX_LEAD より先へ行かない（手を止めれば、すぐ止まる）', () => {
    let a = aim(1000);
    for (let i = 0; i < 100; i++) a = aimWheel(a, 1000, 80, false, H, MAX);
    expect(a.target).toBe(1000 + MAX_LEAD);
    a = aim(1500);
    for (let i = 0; i < 100; i++) a = aimWheel(a, 1500, -80, false, H, MAX);
    expect(a.target).toBe(1500 - MAX_LEAD);
  });

  it('詳細の中から上へ：先頭で受け止める。そのあと新しく回すと、最初の画面へ戻る', () => {
    let a = aimWheel(aim(H + 50), H + 50, -80, true, H, MAX);
    expect(a.target).toBe(H);
    a = aimWheel(a, H, -20, false, H, MAX);
    expect(a.target).toBe(H);
    expect(aimWheel(a, H, -20, true, H, MAX).target).toBe(0);
  });

  it('詳細の先頭で止まっているときに上へ回すと、1 回で最初の画面へ戻る', () => {
    expect(aimWheel(aim(H), H, -40, true, H, MAX).target).toBe(0);
    expect(aimWheel(aim(H + 1), H + 1, -40, true, H, MAX).target).toBe(0);
  });

  it('上へ回し続けると、受け止める量を超えて、止まらずに最初の画面へ通り過ぎる', () => {
    let a = aim(H + 100);
    let x = H + 100;
    for (let i = 0; i < 40 && a.target !== 0; i++) {
      a = aimWheel(a, x, -80, false, H, MAX);
      x = Math.max(a.target, x - 16);
    }
    expect(a.target).toBe(0);
  });
});

describe('ホイールの操作の見分け（trackGesture）', () => {
  function feed(seq: [number, number][]) {
    let g: WheelGesture | null = null;
    return seq.map(([dy, ms]) => {
      const r = trackGesture(g, dy, ms);
      g = r.gesture;
      return r.isNew;
    });
  }

  it('立ち上がって、山を越えて、減っていく 1 回のフリックは、1 つの操作', () => {
    const deltas = [2, 6, 15, 40, 90, 120, 118, 110, 90, 70, 50, 30, 18, 10, 5, 3, 2, 1, 1];
    const news = feed(deltas.map((d, i) => [d, i * 16]));
    expect(news[0]).toBe(true);
    expect(news.slice(1).some(Boolean)).toBe(false);
  });

  it('間が空いたら、新しい操作', () => {
    expect(feed([[100, 0], [100, 300]])).toEqual([true, true]);
    expect(feed([[100, 0], [100, 60]])).toEqual([true, false]);
  });

  it('向きが変わったら、新しい操作', () => {
    expect(feed([[100, 0], [-100, 16]])).toEqual([true, true]);
  });

  it('余韻の途中で、もう一度回す（減っていた量がまた増える）と、間が空かなくても、新しい操作', () => {
    const news = feed([[120, 0], [80, 16], [40, 32], [20, 48], [60, 64]]);
    expect(news).toEqual([true, false, false, false, true]);
  });

  it('同じ量で回し続ける（速く回すマウス）のは、1 つの操作', () => {
    const news = feed(Array.from({ length: 20 }, (_, i): [number, number] => [100, i * 30]));
    expect(news.slice(1).some(Boolean)).toBe(false);
  });
});

describe('慣性のある動き（ばね＋速さの上限）', () => {
  function run(x0: number, v0: number, target: number, dt = 1 / 60, maxS = 6) {
    let x = x0;
    let v = v0;
    const xs = [x];
    const vs = [v];
    let t = 0;
    while (t < maxS) {
      ({ x, v } = stepLimited(x, v, target, dt));
      t += dt;
      xs.push(x);
      vs.push(v);
      if (Math.abs(x - target) < 0.4 && Math.abs(v) < 4) break;
    }
    return { xs, vs, t };
  }

  it('強く回すほど、速く動き出す。下限があり、上限の速さを超えない', () => {
    expect(kickVelocity(100)).toBeGreaterThan(0);
    expect(kickVelocity(-100)).toBeLessThan(0);
    expect(Math.abs(kickVelocity(200))).toBeGreaterThan(Math.abs(kickVelocity(100)));
    expect(Math.abs(kickVelocity(1))).toBe(250);
    expect(Math.abs(kickVelocity(99_999))).toBe(MAX_SPEED);
  });

  it('どの強さで回しても、どのフレームの間隔でも、速さの上限を超えず、行き過ぎずに止まる', () => {
    for (const dt of [1 / 144, 1 / 60, 1 / 30, 0.1]) {
      for (const dy of [4, 100, 400, 3000]) {
        const { xs, vs } = run(0, kickVelocity(dy), H, dt);
        expect(Math.max(...vs.map(Math.abs))).toBeLessThanOrEqual(MAX_SPEED);
        expect(Math.max(...xs)).toBeLessThanOrEqual(H + 1e-6);
        expect(xs.every((x, i) => i === 0 || x >= xs[i - 1] - 1e-9)).toBe(true);
        expect(Math.abs(xs.at(-1)! - H)).toBeLessThan(0.4);
      }
    }
  });

  it('720px の移動は、上限の速さまで上がって、約 1.2〜2 秒で収まる', () => {
    const { vs, t } = run(0, kickVelocity(100), H);
    expect(Math.max(...vs)).toBe(MAX_SPEED);
    expect(t).toBeGreaterThan(1.2);
    expect(t).toBeLessThan(2);
  });

  it('動き出しの加速に上限がある（1 フレームで速さが跳ね上がらない）', () => {
    const dt = 1 / 60;
    const { vs } = run(0, 0, H, dt);
    for (let i = 1; i < vs.length; i++) expect(vs[i] - vs[i - 1]).toBeLessThanOrEqual(MAX_ACCEL * dt + 1e-6);
  });

  it('速さの山は 1 つ（減速の途中で、また速くならない）', () => {
    const { vs } = run(0, 600, H);
    const peak = vs.indexOf(Math.max(...vs));
    for (let i = 1; i <= peak; i++) expect(vs[i]).toBeGreaterThanOrEqual(vs[i - 1] - 1e-6);
    const lastPeak = vs.lastIndexOf(Math.max(...vs));
    for (let i = lastPeak + 1; i < vs.length; i++) expect(vs[i]).toBeLessThanOrEqual(vs[i - 1] + 1e-6);
  });

  it('制限に掛からない範囲では、フレームの間隔が揺れても、動きが変わらない', () => {
    const big = stepSpring(0, 200, 300, 0.5);
    let x = 0;
    let v = 200;
    for (let i = 0; i < 50; i++) ({ x, v } = stepSpring(x, v, 300, 0.01));
    expect(x).toBeCloseTo(big.x, 6);
    expect(v).toBeCloseTo(big.v, 6);
  });

  it('動いている途中で、行き先を変えても、いまの位置と速さから、なめらかに向きを変える（飛ばない）', () => {
    let x = 0;
    let v = kickVelocity(120);
    for (let i = 0; i < 20; i++) ({ x, v } = stepLimited(x, v, H, 1 / 60));
    const before = x;
    const next = stepLimited(x, v, 0, 1 / 60);
    expect(Math.abs(next.x - before)).toBeLessThan((MAX_SPEED / 60) * 1.01);
    let y = next.x;
    let w = next.v;
    for (let i = 0; i < 300; i++) ({ x: y, v: w } = stepLimited(y, w, 0, 1 / 60));
    expect(Math.abs(y)).toBeLessThan(0.5);
  });

  it('行き先が今の位置より MAX_LEAD だけ先にあり続けると、上限に近い速さで進み続ける（境目で止まらない）', () => {
    expect(MAX_LEAD).toBeCloseTo((2 * MAX_SPEED) / SPRING_OMEGA);
    let x = 0;
    let v = MAX_SPEED;
    const vs: number[] = [];
    for (let i = 0; i < 180; i++) {
      ({ x, v } = stepLimited(x, v, x + MAX_LEAD, 1 / 60));
      vs.push(v);
    }
    expect(Math.min(...vs)).toBeGreaterThan(MAX_SPEED * 0.95);
  });
});
