import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { constellationAt, constellationSegments, decodeConstellations, type Constellation } from './constellations';
import { decodeStars, STAR_STRIDE } from './stars';

const file = (p: string) => readFileSync(new URL(`../../public/data/${p}`, import.meta.url));
const buffer = (p: string) => {
  const b = file(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer;
};
const stars = decodeStars(buffer('stars.bin'));
const list = decodeConstellations(JSON.parse(file('constellations.json').toString()));

describe('星座', () => {
  it('88 星座がそろっている（へび座は頭と尾に分かれる）', () => {
    expect(list.length).toBe(89);
    expect(list.every((c) => c.nameJa.length > 0 && c.lines.length > 0)).toBe(true);
  });

  it('線の両端はほとんど星のデータの星で、オリオン座はベテルギウス（HYG 27919）とリゲル（HYG 24378）を含む', () => {
    const seg = constellationSegments(list, stars.data, STAR_STRIDE);
    const total = list.reduce((n, c) => n + c.lines.length, 0);
    expect(seg.positions.length / 6).toBe(total);
    const ori = list.find((c) => c.id === 'Ori')!;
    const ids = new Set(ori.lines.flat());
    expect(ids.has(27919)).toBe(true);
    expect(ids.has(24378)).toBe(true);
  });

  it('見ている向きの先の星座を選ぶ。遠くへ行くと、同じ星を見ても向きが変わる', () => {
    const seg = constellationSegments(list, stars.data, STAR_STRIDE);
    const star = (hyg: number) => {
      for (let o = 0; o < stars.data.length; o += STAR_STRIDE) {
        if (stars.data[o + 5] === hyg) return { x: stars.data[o], y: stars.data[o + 1], z: stars.data[o + 2] };
      }
      throw new Error('星が無い');
    };
    // 地球から、ベテルギウスの方を見る（太陽系の大きさは星の距離に比べて無視できる）
    const b = star(27919);
    const d = Math.hypot(b.x, b.y, b.z);
    const forward = { x: b.x / d, y: b.y / d, z: b.z / d };
    expect(constellationAt(seg, { x: 0, y: 0, z: 0 }, forward)?.id).toBe('Ori');
    // 反対の向きには、オリオン座は無い
    expect(constellationAt(seg, { x: 0, y: 0, z: 0 }, { x: -forward.x, y: -forward.y, z: -forward.z })?.id).not.toBe('Ori');
  });

  it('線の間を見ているときも、その星座を選ぶ', () => {
    const c: Constellation = { id: 'T', nameJa: 'テスト', nameEn: 'Test', lines: [[1, 2]] };
    const data = new Float32Array([-10, 100, 0, 0, 0, 1, 10, 100, 0, 0, 0, 2]);
    const seg = constellationSegments([c], data, 6);
    expect(constellationAt(seg, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 1)?.id).toBe('T');
    expect(constellationAt(seg, { x: 0, y: 0, z: 0 }, { x: 0, y: Math.SQRT1_2, z: Math.SQRT1_2 }, 1)).toBeNull();
  });
});
