import { describe, expect, it } from 'vitest';
import { wheelTarget } from './section-scroll';

const H = 720;
describe('2 つの画面の間のホイール', () => {
  it('最初の画面で下へ回すと、どれだけ小さくても、詳細の先頭へ動かす', () => {
    for (const dy of [1, 40, 100, 400, 3000]) expect(wheelTarget(0, H, dy)).toBe(H);
  });

  it('途中（2 つの画面の間）にいても、回した向きの画面へ動かす', () => {
    expect(wheelTarget(300, H, 50)).toBe(H);
    expect(wheelTarget(300, H, -50)).toBe(0);
  });

  it('詳細の先頭で上へ回すと、最初の画面へ戻る', () => {
    expect(wheelTarget(H, H, -100)).toBe(0);
    expect(wheelTarget(H + 1, H, -100)).toBe(0);
  });

  it('詳細の中は、ブラウザに任せる（下へも上へも）', () => {
    expect(wheelTarget(H, H, 100)).toBeNull();
    expect(wheelTarget(H + 400, H, 100)).toBeNull();
    expect(wheelTarget(H + 400, H, -100)).toBeNull();
    expect(wheelTarget(H + 3, H, -100)).toBeNull();
  });

  it('最初の画面の先頭で上へ回しても、何もしない。回転が 0 でも、何もしない', () => {
    expect(wheelTarget(0, H, -100)).toBeNull();
    expect(wheelTarget(0, H, 0)).toBeNull();
    expect(wheelTarget(300, H, 0.2)).toBeNull();
  });
});
