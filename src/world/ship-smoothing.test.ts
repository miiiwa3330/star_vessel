import { describe, expect, it } from 'vitest';
import { ShipSmoother } from './ship-smoothing';
import type { ShipSnapshot } from './ship-schema';
import type { Quat } from './quat';

const FRAME_S = 1 / 60;
const T0 = Date.UTC(2026, 10, 5);
const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };
const snap = (at: number, x: number, vx: number, orientation = IDENTITY): ShipSnapshot => ({
  id: 'a',
  hue: 0,
  at,
  s: { anchor: 'Sun', offsetKm: { x, y: 0, z: 0 }, velocityKmS: { x: vx, y: 0, z: 0 }, orientation },
});

/** snapshots を時刻の順に受け取りながら 60 fps で動かし、フレームごとの x を返す */
function fly(snapshots: readonly ShipSnapshot[], seconds: number) {
  const s = new ShipSmoother();
  const xs: number[] = [];
  const quats: Quat[] = [];
  for (let f = 0; f < seconds * 60; f++) {
    const nowMs = T0 + f * FRAME_S * 1000;
    const latest = [...snapshots].reverse().find((n) => n.at <= nowMs);
    if (!latest) continue;
    const [ship] = s.update([latest], new Date(nowMs), FRAME_S);
    xs.push(ship.positionKm.x);
    quats.push(ship.orientation);
  }
  return { xs, quats };
}
const steps = (xs: readonly number[]) => xs.slice(1).map((x, i) => Math.abs(x - xs[i]));

describe('ShipSmoother', () => {
  it('速さが一定なら、状態が届いても歩幅は変わらない', () => {
    const list = [0, 250, 500, 750, 1000, 1250].map((ms) => snap(T0 + ms, 100 * (ms / 1000), 100));
    const d = steps(fly(list, 1.4).xs);
    // 100 km/s × 1/60 秒。Date が ms で切り捨てられるぶん（0.1 km）だけ前後する
    for (const v of d) expect(v).toBeCloseTo(100 / 60, 0);
  });

  it('予測と違う状態が届いても、1 フレームで飛ばない', () => {
    // 100 km/s で進むはずが、向きを変えて止まった（予測より 25 km 手前の状態が届く）
    const list = [snap(T0, 0, 100), snap(T0 + 250, 0, 0), snap(T0 + 500, 0, 0)];
    const d = steps(fly(list, 0.8).xs);
    // 残った 25 km の食い違いは、そのまま飛ばず、1 フレームで 2.7 km ほどずつ消える
    expect(Math.max(...d)).toBeLessThan(3);
    const last = fly(list, 2).xs.at(-1)!;
    expect(last).toBeCloseTo(0, 1);
  });

  it('ワープは滑らせず、その場所へ移す', () => {
    const list = [snap(T0, 0, 100), snap(T0 + 250, 5e7, 0)];
    const { xs } = fly(list, 0.4);
    expect(xs.at(-1)).toBe(5e7);
  });

  it('向きは、次の状態が届くまでの時間をかけて回す', () => {
    const turned: Quat = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }; // z 軸のまわりに 90 度
    const list = [snap(T0, 0, 0), snap(T0 + 250, 0, 0, turned)];
    const { quats } = fly(list, 0.6);
    const angles = quats.map((q) => 2 * Math.atan2(q.z, q.w) * (180 / Math.PI));
    const moves = steps(angles);
    expect(Math.max(...moves)).toBeLessThan(8); // 90 度 ÷ 15 フレーム = 6 度くらいずつ
    expect(angles.at(-1)).toBeCloseTo(90, 6);
  });

  it('基準の天体が分からない船は描かない', () => {
    const s = new ShipSmoother();
    const unknown = { ...snap(T0, 0, 0), s: { ...snap(T0, 0, 0).s, anchor: 'no-such-body' } };
    expect(s.update([unknown], new Date(T0), FRAME_S)).toEqual([]);
  });

  it('いなくなった船は忘れる', () => {
    const s = new ShipSmoother();
    s.update([snap(T0, 0, 100)], new Date(T0), FRAME_S);
    expect(s.update([], new Date(T0), FRAME_S)).toEqual([]);
    const [again] = s.update([snap(T0, 5, 0)], new Date(T0), FRAME_S);
    expect(again.positionKm.x).toBe(5);
  });
});
