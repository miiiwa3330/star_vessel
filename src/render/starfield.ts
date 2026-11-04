/**
 * 本物の星（HYG）を描く。星の位置は pc 単位のまま、星専用の場面（scene）に置く。
 */
import { STAR_STRIDE, type StarCatalog } from '../world/stars';
import { StarSprites } from './star-sprites';

export function createStarfield(catalog: StarCatalog): StarSprites {
  const { count, data } = catalog;
  const stars = new StarSprites(count);
  stars.set(count, (i) => {
    const o = i * STAR_STRIDE;
    return { x: data[o], y: data[o + 1], z: data[o + 2], absMag: data[o + 3], bv: data[o + 4] };
  });
  return stars;
}

/** 系外惑星のデータにだけある恒星（HYG に無い恒星）を描く */
export function createExtraStarfield(list: readonly { position: { x: number; y: number; z: number }; absMag: number; bv: number }[]): StarSprites {
  const stars = new StarSprites(Math.max(1, list.length));
  stars.set(list.length, (i) => ({ ...list[i].position, absMag: list[i].absMag, bv: list[i].bv }));
  return stars;
}
