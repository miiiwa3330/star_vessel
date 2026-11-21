/**
 * いま遊んでいる人数の API（要件 F50）。ログイン不要（タイトル画面は、ログインの前に出すため）。
 *
 * GET /api/presence  { online: 人数 }。数え方は src/world/presence.ts
 */
import { Hono } from 'hono';
import { clampOnline, onlineCountStatement } from '../src/world/presence';
import type { AppEnv } from './index';

const CACHE_SECONDS = 15;
export const presence = new Hono<AppEnv>();

presence.get('/', async (c) => {
  const cache = (caches as unknown as { default?: Cache }).default;
  const key = new Request('https://cache.star-vessel.invalid/api/presence');
  const hit = await cache?.match(key).catch(() => undefined);
  if (hit) return hit;

  const s = onlineCountStatement(Date.now());
  const row = await c.env.DB.prepare(s.sql)
    .bind(...s.params)
    .first<{ online: number }>();
  const res = new Response(JSON.stringify({ online: clampOnline(row?.online) }), {
    headers: {
      'content-type': 'application/json',
      // 15 秒だけ、ブラウザと Cloudflare が覚えておく（タイトル画面が開かれるたびに D1 を読まないため）
      'cache-control': `public, max-age=${CACHE_SECONDS}`,
    },
  });
  if (cache) c.executionCtx.waitUntil(cache.put(key, res.clone()).catch(() => undefined));
  return res;
});
