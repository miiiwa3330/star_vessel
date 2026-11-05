import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { asteroidPositionKm, diameterFromH, findAsteroidByNumber, findNearbyAsteroids } from './asteroid-search';
import { smallAsteroidBody } from './small-bodies';
import { keplerPositionKm, type KeplerElements } from './kepler';
import { length, sub } from './vec';

const buf = readFileSync('public/data/asteroids-0.bin');
const chunk = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const DATE = new Date('2026-11-05T00:00:00Z');
/** ケレス（太陽から・ICRF・km）。JPL Horizons、2026-11-05 00:00 TDB、2026-11-05 に取得 */
const CERES = { x: -1.317571304903548e7, y: 3.569201063742787e8, z: 1.710357960599394e8 };

describe('近くの小惑星を探す', () => {
  it('光の点のデータ（32bit）からの位置でも、ケレスは Horizons と 0.1% 以内', () => {
    const o = [...Array(chunk.length / 9).keys()].find((k) => chunk[k * 9] === 1)! * 9;
    const p = asteroidPositionKm(chunk, o, DATE);
    expect(length(sub(p, CERES)) / length(CERES)).toBeLessThan(0.001);
  });

  it('ケレスのそばでは、ケレスがいちばん近い', () => {
    const near = findNearbyAsteroids([chunk], { x: CERES.x + 1e5, y: CERES.y, z: CERES.z }, DATE, 2e6, 8);
    expect(near[0].number).toBe(1);
    expect(near[0].distanceKm).toBeLessThan(2e5);
  });

  it('番号で探せて、球の天体にすると同じ場所に来る', () => {
    const eros = findAsteroidByNumber([chunk], 433)!;
    expect(eros).not.toBeNull();
    const body = smallAsteroidBody(eros);
    expect(body.id).toBe('A433');
    const fromBody = keplerPositionKm((body.motion as { elements: KeplerElements }).elements, DATE);
    const o = [...Array(chunk.length / 9).keys()].find((k) => chunk[k * 9] === 433)! * 9;
    expect(length(sub(fromBody, asteroidPositionKm(chunk, o, DATE)))).toBeLessThan(1);
  });

  it('H から直径を推定する（H = 15・反射率 0.15 で約 3.4 km）', () => {
    expect(diameterFromH(15)).toBeCloseTo(3.43, 1);
  });
});
