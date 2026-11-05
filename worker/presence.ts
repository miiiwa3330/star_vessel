/**
 * いま遊んでいる人数の API（要件 F50）。ログイン不要（タイトル画面は、ログインの前に出すため）。
 *
 * GET /api/presence  { online: 人数 }。数え方は src/world/presence.ts
 */
import { Hono } from 'hono';
import { clampOnline, onlineCountStatement } from '../src/world/presence';
import type { AppEnv } from './index';

export const presence = new Hono<AppEnv>();

presence.get('/', async (c) => {
  const s = onlineCountStatement(Date.now());
  const row = await c.env.DB.prepare(s.sql)
    .bind(...s.params)
    .first<{ online: number }>();
  // 15 秒だけ、ブラウザと Cloudflare が覚えておく（タイトル画面が開かれるたびに D1 を読まないため）
  c.header('Cache-Control', 'public, max-age=15');
  return c.json({ online: clampOnline(row?.online) });
});
