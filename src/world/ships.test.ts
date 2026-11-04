import { describe, expect, it } from 'vitest';
import { hueFromId, isShipState, MAX_SPEED_KM_S, type ShipSnapshot, type ShipState } from './ship-schema';
import { nearestIndices, predictShip } from './ships';

const state: ShipState = {
  anchor: 'Earth',
  offsetKm: { x: 20_000, y: 0, z: 0 },
  velocityKmS: { x: 0, y: 100, z: 0 },
  orientation: { x: 0, y: 0, z: 0, w: 1 },
};

describe('isShipState', () => {
  it('正しい状態を受け付け、壊れた状態は受け付けない', () => {
    expect(isShipState(state)).toBe(true);
    expect(isShipState({ ...state, anchor: 'Vulcan' })).toBe(false);
    expect(isShipState({ ...state, orientation: { x: 0, y: 0, z: 0, w: 2 } })).toBe(false);
    expect(isShipState({ ...state, offsetKm: { x: Number.POSITIVE_INFINITY, y: 0, z: 0 } })).toBe(false);
    expect(isShipState({ ...state, velocityKmS: { x: MAX_SPEED_KM_S * 2, y: 0, z: 0 } })).toBe(false);
    expect(isShipState(null)).toBe(false);
  });
});

describe('hueFromId', () => {
  it('同じ ID はいつも同じ色、0〜359', () => {
    expect(hueFromId('abc')).toBe(hueFromId('abc'));
    const ids = ['a', 'b', 'user-1', 'user-2', 'x'.repeat(40)];
    for (const id of ids) {
      const h = hueFromId(id);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
    expect(new Set(ids.map(hueFromId)).size).toBeGreaterThan(3);
  });
});

describe('predictShip', () => {
  const snap: ShipSnapshot = { id: 's', hue: 0, s: state, at: 10_000 };
  it('速度のまま進める', () => {
    expect(predictShip(snap, 11_000).offsetKm.y).toBeCloseTo(100, 9);
  });
  it('長く届かないときは、2 秒ぶんで止める', () => {
    expect(predictShip(snap, 60_000).offsetKm.y).toBeCloseTo(200, 9);
  });
  it('受け取る前の時刻なら、動かさない', () => {
    expect(predictShip(snap, 9_000).offsetKm).toEqual(state.offsetKm);
  });
});

describe('nearestIndices', () => {
  it('近い順に、自分を除いて選ぶ', () => {
    const p = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 7, y: 0, z: 0 },
    ];
    expect(nearestIndices(p[0], p, 2, 0)).toEqual([2, 3]);
  });
});

describe('サーバーが知らない天体を基準にした船', () => {
  it('位置の計算は例外になる（サーバーはこれを受けて相対位置で代わりにする。worker/space-room.ts）', async () => {
    const { shipPositionKm } = await import('./ships');
    expect(() =>
      shipPositionKm({ anchor: 'H70666.2', offsetKm: { x: 1, y: 0, z: 0 }, velocityKmS: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } }, new Date()),
    ).toThrow();
  });
});
