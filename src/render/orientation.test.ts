import { describe, expect, it } from 'vitest';
import { SPHERE_TO_BODY_FIXED } from './orientation';
import { mulVec } from '../world/vec';

describe('SPHERE_TO_BODY_FIXED', () => {
  it('球の +Y（画像の上端）は天体の北極', () => {
    expect(mulVec(SPHERE_TO_BODY_FIXED, { x: 0, y: 1, z: 0 })).toEqual({ x: 0, y: 0, z: 1 });
  });
  it('球の +X（画像の中央）は本初子午線', () => {
    expect(mulVec(SPHERE_TO_BODY_FIXED, { x: 1, y: 0, z: 0 })).toEqual({ x: 1, y: 0, z: 0 });
  });
  it('球の −Z（画像の右から 1/4）は東経 90 度', () => {
    const v = mulVec(SPHERE_TO_BODY_FIXED, { x: 0, y: 0, z: -1 });
    expect(v.y).toBe(1);
  });
});
