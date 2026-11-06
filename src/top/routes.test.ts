import { describe, expect, it } from 'vitest';
import { isPlayPath, playUrl } from './routes';

describe('画面の URL', () => {
  it('/play だけが世界。末尾のスラッシュは同じ扱い', () => {
    expect(isPlayPath('/play')).toBe(true);
    expect(isPlayPath('/play/')).toBe(true);
    expect(isPlayPath('/')).toBe(false);
    expect(isPlayPath('/ready')).toBe(false);
    expect(isPlayPath('/playground')).toBe(false);
  });

  it('出発のとき、確かめ用の指定を世界に引き継ぐ', () => {
    expect(playUrl('')).toBe('/play');
    expect(playUrl('?asteroids=bright&stars=hyg')).toBe('/play?asteroids=bright&stars=hyg');
  });
});
