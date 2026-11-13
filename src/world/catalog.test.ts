import { describe, expect, it } from 'vitest';
import { buildCatalog, countByKind, formatCatalogNo, solOrder, type CatalogSeed } from './catalog';

const seed = (key: string, extra: Partial<CatalogSeed<null>>): CatalogSeed<null> => ({
  key,
  kind: 'star',
  name: key,
  nameEn: null,
  data: null,
  ...extra,
});

describe('buildCatalog（図鑑の通しの番号）', () => {
  it('太陽系を先に並べ順に、そのあと太陽系の外を近い順に。番号は 1 から通し', () => {
    const cat = buildCatalog([
      seed('Far', { distancePc: 100 }),
      seed('Moon', { kind: 'moon', order: solOrder.planet(3, 1) }),
      seed('Near', { distancePc: 1.3 }),
      seed('Earth', { kind: 'planet', order: solOrder.planet(3) }),
      seed('Sun', { order: solOrder.sun }),
      seed('Mercury', { kind: 'planet', order: solOrder.planet(1) }),
    ]);
    expect(cat.map((e) => e.key)).toEqual(['Sun', 'Mercury', 'Earth', 'Moon', 'Near', 'Far']);
    expect(cat.map((e) => e.no)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('恒星の惑星は、その恒星のすぐ後ろ。同じ記号は先のものだけ', () => {
    const cat = buildCatalog([
      seed('B', { distancePc: 5 }),
      seed('A', {
        distancePc: 2,
        children: [seed('A.1', { kind: 'exoplanet' }), seed('A.2', { kind: 'exoplanet' })],
      }),
      seed('A', { distancePc: 1 }),
    ]);
    // 近い方の A（距離 1）が先に来て残り、あとの A（惑星付き）は捨てる
    expect(cat.map((e) => e.key)).toEqual(['A', 'B']);
    const cat2 = buildCatalog([seed('A', { distancePc: 2, children: [seed('A.1', { kind: 'exoplanet' })] }), seed('B', { distancePc: 5 })]);
    expect(cat2.map((e) => [e.key, e.parentKey])).toEqual([
      ['A', null],
      ['A.1', 'A'],
      ['B', null],
    ]);
  });

  it('入れる順によらず、同じ番号になる', () => {
    const seeds = [seed('X', { distancePc: 3 }), seed('Y', { distancePc: 3 }), seed('Z', { order: 5 })];
    const a = buildCatalog(seeds).map((e) => e.key);
    const b = buildCatalog([...seeds].reverse()).map((e) => e.key);
    expect(a).toEqual(b);
  });
});

describe('番号の書き方・数', () => {
  it('5 桁', () => {
    expect(formatCatalogNo(42)).toBe('No.00042');
  });
  it('種類ごとの、集めた数と全体の数', () => {
    const c = countByKind(
      [
        { key: 'a', kind: 'planet' },
        { key: 'b', kind: 'planet' },
        { key: 'c', kind: 'moon' },
      ],
      new Set(['b']),
    );
    expect(c.get('planet')).toEqual({ got: 1, total: 2 });
    expect(c.get('moon')).toEqual({ got: 0, total: 1 });
  });
});
