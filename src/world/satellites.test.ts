import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SatelliteCatalog, satellitePositionKm, type SatelliteRecord } from './satellites';
import { fromSatnogs } from './satellite-data';
import { length, sub } from './vec';
import { bodyAddress } from './address';

const records = (JSON.parse(readFileSync('public/data/satellites.json', 'utf8')) as { satellites: SatelliteRecord[] }).satellites;
const catalog = new SatelliteCatalog(records);
/** ISS の位置（地球の中心から・ICRF・km）。JPL Horizons、2026-11-05 00:00 UT、2026-11-05 に取得 */
const ISS_HORIZONS = { x: -1.732302720552188e3, y: -3.936459712067269e3, z: -5.267486486811204e3 };

describe('人工衛星', () => {
  it('ISS の位置は Horizons と 30 km 以内（TLE の元期は 1 日前）', () => {
    const i = catalog.indexOfId(25544);
    const p = satellitePositionKm(catalog.satrecs[i], new Date('2026-11-05T00:00:00Z'))!.p;
    expect(length(sub(p, ISS_HORIZONS))).toBeLessThan(30);
  });

  it('速度で進めた位置も、SGP4 で計算し直した位置と 1 秒あたり数 m しか違わない', () => {
    const t0 = new Date('2026-11-05T00:00:00Z');
    const c = new SatelliteCatalog(records.filter((r) => r.id === 25544));
    c.update(t0, true);
    // 1 秒だけ進める（ROLL_FRACTION の分だけ計算し直す。1 機なら毎回計算し直すので、2 機目で確かめる代わりに直接比べる）
    const p1 = satellitePositionKm(c.satrecs[0], new Date(t0.getTime() + 1000))!.p;
    const v = satellitePositionKm(c.satrecs[0], t0)!.v;
    const p0 = satellitePositionKm(c.satrecs[0], t0)!.p;
    const predicted = { x: p0.x + v.x, y: p0.y + v.y, z: p0.z + v.z };
    expect(length(sub(predicted, p1))).toBeLessThan(0.01);
  });

  it('天体の id は N＋カタログ番号で、住所は地球のまわり', () => {
    const b = catalog.body(catalog.indexOfId(25544));
    expect(b.id).toBe('N25544');
    expect(b.nameJa).toBe('国際宇宙ステーション（ISS）');
    expect(bodyAddress('N25544')).toEqual({ planet: '3', moon: 0, system: 'SOL' });
  });

  it('SatNOGS の形のおかしいものは捨てる', () => {
    const good = { norad_cat_id: 25544, tle0: '0 ISS (ZARYA)', tle1: records[0].l1, tle2: records[0].l2 };
    expect(fromSatnogs([good, { norad_cat_id: -1 }, { norad_cat_id: 5, tle1: 'x', tle2: 'y' }, 'junk'])).toHaveLength(1);
    expect(fromSatnogs('nope')).toEqual([]);
  });
});
