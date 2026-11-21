import { describe, expect, it } from 'vitest';
import { BUILD_RANGE_M, encodeBlocks, decodeBlocks, isValidBlocks } from './ship-blocks';
import { HULL_TYPES } from './ship-design';
import { presetBlocks } from './ship-presets';
import { buildShipMesh } from './voxel-mesh';

describe('最初から選べる 3 つの UFO', () => {
  it.each(HULL_TYPES)('%s は、自分で作る船と同じ決まりに収まる', (hull) => {
    const blocks = presetBlocks(hull);
    expect(isValidBlocks(blocks)).toBe(true);
    expect(decodeBlocks(encodeBlocks(blocks))?.length).toBe(blocks.length);
    const mesh = buildShipMesh(blocks);
    expect(mesh.sizeM.x).toBeLessThanOrEqual(BUILD_RANGE_M);
    expect(mesh.glow.indices.length).toBeGreaterThan(0); // 光（ふちの灯り・前の白い灯り）がある
  });

  it('大きさは前の形と同じくらい（ソーサー 30 m・ベル 24 m・リング 36 m）', () => {
    const near = (hull: 'saucer' | 'bell' | 'ring', m: number) => expect(Math.abs(buildShipMesh(presetBlocks(hull)).lengthM - m)).toBeLessThanOrEqual(1.5);
    near('saucer', 30);
    near('bell', 24);
    near('ring', 36);
  });
});
