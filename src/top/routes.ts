/**
 * 画面の URL の決まり（要件 F48）。純粋な関数にして、テストする（routes.test.ts）。
 *
 *   /        タイトル画面
 *   /ready   準備画面（宇宙船とアカウントを決めて、出発する）
 *   /play    世界（src/main.ts）
 */
export type TopScreen = 'title' | 'ready';

/** 末尾のスラッシュを取る（/ready/ も /ready として扱う） */
const clean = (path: string): string => path.replace(/\/+$/, '') || '/';

export const isPlayPath = (path: string): boolean => clean(path) === '/play';

/** タイトル画面と準備画面の、どちらを出すか。知らない URL はタイトル画面 */
export const screenForPath = (path: string): TopScreen => (clean(path) === '/ready' ? 'ready' : 'title');

export const pathForScreen = (screen: TopScreen): string => (screen === 'ready' ? '/ready' : '/');

/** 出発する先。?asteroids=bright などの指定は、世界に引き継ぐ（開発・確かめ用） */
export const playUrl = (search: string): string => `/play${search}`;
