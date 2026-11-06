/**
 * 画面の URL の決まり（要件 F48）。純粋な関数にして、テストする（routes.test.ts）。
 *
 *   /        タイトル画面（船を選ぶ・アカウントも、この中の状態で、URL は変えない）
 *   /play    世界（src/main.ts）
 *
 * 準備画面（/ready）は、2026-11-06 に無くした。知らない URL は、タイトル画面を出す
 */

/** 末尾のスラッシュを取る（/play/ も /play として扱う） */
const clean = (path: string): string => path.replace(/\/+$/, '') || '/';

export const isPlayPath = (path: string): boolean => clean(path) === '/play';

/** 出発する先。?asteroids=bright などの指定は、世界に引き継ぐ（開発・確かめ用） */
export const playUrl = (search: string): string => `/play${search}`;
