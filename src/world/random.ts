/**
 * 決まった種から、誰の端末でも同じ並びになる乱数。銀河の自動生成（要件 F8：誰が見ても同じ天体）に使う。
 * 整数の計算（Math.imul・ビット演算）だけで作るので、ブラウザによって結果が変わらない。
 */

/** 整数をいくつか混ぜて 32bit の種にする */
export function hashInts(...values: number[]): number {
  let h = 0x9e3779b9;
  for (const v of values) {
    h = Math.imul(h ^ (v | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

/** mulberry32。0 以上 1 未満の数を返す関数を作る */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
