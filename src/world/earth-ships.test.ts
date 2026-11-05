import { describe, expect, it } from 'vitest';
import { earthShips } from './earth-ships';
import { isEarthShipsSnapshot, MAX_SHOWCASE_SHIPS, SHOWCASE_RADIUS_KM } from './earth-ships-schema';
import { SHIP_STALE_MS, type ShipSnapshot, type ShipState } from './ship-schema';
import { heliocentricPositionKm } from './solar-system';
import { length, sub } from './vec';

const NOW = Date.UTC(2026, 10, 6, 12, 0, 0);
const Q = { x: 0, y: 0, z: 0, w: 1 };
const state = (anchor: ShipState['anchor'], o: [number, number, number], v: [number, number, number] = [0, 0, 0]): ShipState => ({
  anchor,
  offsetKm: { x: o[0], y: o[1], z: o[2] },
  velocityKmS: { x: v[0], y: v[1], z: v[2] },
  orientation: Q,
});
const snap = (id: string, s: ShipState, at = NOW): ShipSnapshot => ({ id, hue: 120, s, at });

describe('地球のまわりの船', () => {
  it('地球を基準にした船は、地球の中心からの位置と速度がそのまま出る', () => {
    const r = earthShips([snap('a', state('Earth', [20_000, 0, 0], [0, 500, 0]))], NOW);
    expect(r.ships).toHaveLength(1);
    expect(r.ships[0].position.x).toBeCloseTo(20_000, 3);
    expect(r.ships[0].velocity.y).toBeCloseTo(500, 3);
    expect(r.now).toBe(NOW);
  });

  it('太陽を基準にした船でも、地球の中心からの位置にする（地球の近くなら出る）', () => {
    const earth = heliocentricPositionKm('Earth', new Date(NOW));
    const s = state('Sun', [earth.x + 50_000, earth.y, earth.z]);
    const r = earthShips([snap('s', s)], NOW);
    expect(r.ships).toHaveLength(1);
    expect(length(r.ships[0].position)).toBeCloseTo(50_000, 0);
  });

  it('月を基準にした船は、月の位置を足して、地球から見た位置にする', () => {
    const moon = sub(heliocentricPositionKm('Moon', new Date(NOW)), heliocentricPositionKm('Earth', new Date(NOW)));
    const r = earthShips([snap('m', state('Moon', [1_000, 0, 0]))], NOW);
    expect(r.ships[0].position.x).toBeCloseTo(moon.x + 1_000, 3);
    expect(r.ships[0].position.y).toBeCloseTo(moon.y, 3);
  });

  it('基準の天体が動いていても、速度は地球に対する速さ（太陽基準で止まっている船は、地球に対しては動く）', () => {
    const earth = heliocentricPositionKm('Earth', new Date(NOW));
    const r = earthShips([snap('s', state('Sun', [earth.x + 50_000, earth.y, earth.z]))], NOW);
    // 地球は秒速約 30 km で太陽のまわりを回るので、止まった船は地球から見て同じ速さで動く
    expect(length(r.ships[0].velocity)).toBeGreaterThan(25);
    expect(length(r.ships[0].velocity)).toBeLessThan(35);
  });

  it('状態が届いてから時間がたった船は、速度のまま進んだ位置で出す', () => {
    const r = earthShips([snap('a', state('Earth', [20_000, 0, 0], [0, 100, 0]), NOW - 1_500)], NOW);
    expect(r.ships[0].position.y).toBeCloseTo(150, 3);
    // 予測は 2 秒で止まる（predictShip）が、速度は 1 秒ぶんの差から出すので、古くても速さは変わらない
    expect(r.ships[0].velocity.y).toBeCloseTo(100, 3);
    const older = earthShips([snap('a', state('Earth', [20_000, 0, 0], [0, 100, 0]), NOW - 1_900)], NOW);
    expect(older.ships[0].velocity.y).toBeCloseTo(100, 3);
  });

  it('遠い船・古い船は出さない。近い順に並べ、数の上限を守る', () => {
    const far = snap('far', state('Earth', [SHOWCASE_RADIUS_KM + 1, 0, 0]));
    const stale = snap('stale', state('Earth', [10_000, 0, 0]), NOW - SHIP_STALE_MS - 1);
    const many = Array.from({ length: MAX_SHOWCASE_SHIPS + 8 }, (_, i) => snap(`n${i}`, state('Earth', [10_000 + i * 1_000, 0, 0])));
    const r = earthShips([far, stale, ...many.reverse()], NOW);
    expect(r.ships).toHaveLength(MAX_SHOWCASE_SHIPS);
    expect(r.ships.some((s) => s.id === 'far' || s.id === 'stale')).toBe(false);
    expect(r.ships[0].id).toBe('n0');
    expect(r.ships.map((s) => s.position.x)).toEqual([...r.ships.map((s) => s.position.x)].sort((a, b) => a - b));
  });

  it('アカウントを特定できるものは出ない（ID・ユーザー名は含まれない）', () => {
    const r = earthShips([snap('a', state('Earth', [20_000, 0, 0]))], NOW);
    expect(Object.keys(r.ships[0]).sort()).toEqual(['hue', 'id', 'position', 'velocity']);
    expect(isEarthShipsSnapshot(r)).toBe(true);
  });

  it('受け取ったものの確かめ：形が違えば拒否する', () => {
    const ok = { now: 1, ships: [{ id: 'a', hue: 10, position: { x: 1, y: 2, z: 3 }, velocity: { x: 0, y: 0, z: 0 } }] };
    expect(isEarthShipsSnapshot(ok)).toBe(true);
    for (const bad of [null, {}, { now: 1 }, { now: 'x', ships: [] }, { now: 1, ships: [{ id: '', hue: 1, position: ok.ships[0].position, velocity: ok.ships[0].velocity }] }, { now: 1, ships: [{ ...ok.ships[0], position: { x: NaN, y: 0, z: 0 } }] }, { now: 1, ships: Array(MAX_SHOWCASE_SHIPS + 1).fill(ok.ships[0]) }]) {
      expect(isEarthShipsSnapshot(bad)).toBe(false);
    }
  });
});
