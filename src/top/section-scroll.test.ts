import { describe, expect, it } from 'vitest';
import { kickVelocity, SPRING_OMEGA, stepSpring, wheelTarget } from './section-scroll';

const H = 720;
describe('2 つの画面の間のホイール', () => {
  it('最初の画面で下へ回すと、どれだけ小さくても、詳細の先頭へ動かす', () => {
    for (const dy of [1, 40, 100, 400, 3000]) expect(wheelTarget(0, H, dy)).toBe(H);
  });

  it('途中（2 つの画面の間）にいても、回した向きの画面へ動かす', () => {
    expect(wheelTarget(300, H, 50)).toBe(H);
    expect(wheelTarget(300, H, -50)).toBe(0);
  });

  it('詳細の先頭で上へ回すと、最初の画面へ戻る', () => {
    expect(wheelTarget(H, H, -100)).toBe(0);
    expect(wheelTarget(H + 1, H, -100)).toBe(0);
  });

  it('詳細の中は、ブラウザに任せる（下へも上へも）', () => {
    expect(wheelTarget(H, H, 100)).toBeNull();
    expect(wheelTarget(H + 400, H, 100)).toBeNull();
    expect(wheelTarget(H + 400, H, -100)).toBeNull();
    expect(wheelTarget(H + 3, H, -100)).toBeNull();
  });

  it('最初の画面の先頭で上へ回しても、何もしない。回転が 0 でも、何もしない', () => {
    expect(wheelTarget(0, H, -100)).toBeNull();
    expect(wheelTarget(0, H, 0)).toBeNull();
    expect(wheelTarget(300, H, 0.2)).toBeNull();
  });
});

describe('慣性のある動き（臨界減衰のばね）', () => {
  /** 1 フレーム（1/60 秒）ずつ、止まるまで進める */
  function run(x0: number, v0: number, target: number, dt = 1 / 60, maxS = 5) {
    let x = x0;
    let v = v0;
    const xs = [x];
    const vs = [v];
    let t = 0;
    while (t < maxS) {
      ({ x, v } = stepSpring(x, v, target, dt));
      t += dt;
      xs.push(x);
      vs.push(v);
      if (Math.abs(x - target) < 0.4 && Math.abs(v) < 4) break;
    }
    return { xs, vs, t };
  }

  it('強く回した向きに、勢いよく動き出す。強いほど速い。下限と上限がある', () => {
    expect(kickVelocity(100)).toBeGreaterThan(0);
    expect(kickVelocity(-100)).toBeLessThan(0);
    expect(Math.abs(kickVelocity(300))).toBeGreaterThan(Math.abs(kickVelocity(100)));
    expect(Math.abs(kickVelocity(1))).toBe(400);
    expect(Math.abs(kickVelocity(99_999))).toBe(2200);
  });

  it('行き先へ向かい、行き過ぎずに（一度も超えずに）止まる。どの強さで回しても', () => {
    for (const dy of [4, 100, 400, 3000]) {
      const { xs, t } = run(0, kickVelocity(dy), 720);
      expect(Math.max(...xs)).toBeLessThanOrEqual(720 + 1e-6);
      expect(xs.every((x, i) => i === 0 || x >= xs[i - 1] - 1e-9)).toBe(true);
      expect(Math.abs(xs.at(-1)! - 720)).toBeLessThan(0.4);
      expect(t).toBeLessThan(1.6);
    }
  });

  it('慣性：動き出しの速さが残り、はじめは加速し、あとは、なめらかに減速する（速さの山が 1 つ）', () => {
    const { vs } = run(0, 600, 720);
    expect(vs[1]).toBeGreaterThan(600); // はじめは、引く力で加速する
    const peak = vs.indexOf(Math.max(...vs));
    expect(peak).toBeGreaterThan(0);
    for (let i = 1; i <= peak; i++) expect(vs[i]).toBeGreaterThanOrEqual(vs[i - 1] - 1e-6);
    for (let i = peak + 1; i < vs.length; i++) expect(vs[i]).toBeLessThanOrEqual(vs[i - 1] + 1e-6);
    expect(vs.at(-1)!).toBeLessThan(4);
  });

  it('1 回の大きな時間の進みと、細かい進みを重ねたものが、同じ（フレームの間隔が揺れても、動きが変わらない）', () => {
    const big = stepSpring(0, 500, 720, 0.5);
    let x = 0;
    let v = 500;
    for (let i = 0; i < 50; i++) ({ x, v } = stepSpring(x, v, 720, 0.01));
    expect(x).toBeCloseTo(big.x, 6);
    expect(v).toBeCloseTo(big.v, 6);
  });

  it('動いている途中で、行き先を変えても、いまの位置と速さから、なめらかに向きを変える（飛ばない）', () => {
    let x = 0;
    let v = kickVelocity(120);
    for (let i = 0; i < 20; i++) ({ x, v } = stepSpring(x, v, 720, 1 / 60));
    const before = x;
    // ここで、逆向き（最初の画面）へ行き先を変える
    const next = stepSpring(x, v, 0, 1 / 60);
    expect(Math.abs(next.x - before)).toBeLessThan(40); // 1 フレームで飛ばない
    let y = next.x;
    let w = next.v;
    for (let i = 0; i < 300; i++) ({ x: y, v: w } = stepSpring(y, w, 0, 1 / 60));
    expect(Math.abs(y)).toBeLessThan(0.5);
  });

  it('強さ（SPRING_OMEGA）は、約 720px の移動が約 1 秒で収まる値', () => {
    const { t } = run(0, kickVelocity(100), 720);
    expect(SPRING_OMEGA).toBe(6.5);
    expect(t).toBeGreaterThan(0.6);
    expect(t).toBeLessThan(1.5);
  });
});
