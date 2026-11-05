import { describe, expect, it } from 'vitest';
import { isPlayPath, pathForScreen, playUrl, screenForPath } from './routes';

describe('画面の URL', () => {
  it('/play だけが世界。末尾のスラッシュは同じ扱い', () => {
    expect(isPlayPath('/play')).toBe(true);
    expect(isPlayPath('/play/')).toBe(true);
    expect(isPlayPath('/')).toBe(false);
    expect(isPlayPath('/ready')).toBe(false);
    expect(isPlayPath('/playground')).toBe(false);
  });

  it('/ready が準備画面。ほかはタイトル画面', () => {
    expect(screenForPath('/ready')).toBe('ready');
    expect(screenForPath('/ready/')).toBe('ready');
    expect(screenForPath('/')).toBe('title');
    expect(screenForPath('')).toBe('title');
    expect(screenForPath('/unknown')).toBe('title');
  });

  it('画面から URL を作り直すと、同じ画面に戻る', () => {
    expect(screenForPath(pathForScreen('ready'))).toBe('ready');
    expect(screenForPath(pathForScreen('title'))).toBe('title');
  });

  it('出発のとき、確かめ用の指定を世界に引き継ぐ', () => {
    expect(playUrl('')).toBe('/play');
    expect(playUrl('?asteroids=bright&stars=hyg')).toBe('/play?asteroids=bright&stars=hyg');
  });
});
