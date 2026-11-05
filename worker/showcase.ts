/**
 * タイトル画面の背景に出す、地球のまわりの船の API（要件 F53）。ログイン不要の読み取り専用。
 *
 * GET /api/earth-ships  { now, ships: [{ id, hue, position, velocity }] }。形は src/world/earth-ships-schema.ts、計算は src/world/earth-ships.ts
 *
 * 見る人が増えても、宇宙の部屋（Durable Object）への問い合わせが増えないよう、答えを SHOWCASE_REFRESH_MS だけ、
 * Cloudflare のキャッシュ（その場所のデータセンターごと）に覚えさせる。出すのは、位置・速度・色だけ（アカウントの ID は出さない）
 */
import { Hono } from 'hono';
import { SYSTEM_SOL } from '../src/world/address';
import { SHOWCASE_REFRESH_MS } from '../src/world/earth-ships-schema';
import { earthShips } from '../src/world/earth-ships';
import type { AppEnv } from './index';

export const showcase = new Hono<AppEnv>();

showcase.get('/', async (c) => {
  // 覚えさせる先の名前（URL の形にする決まり）。アクセスした人の URL の違い（クエリなど）で別々に覚えないよう、固定にする
  const key = new Request(new URL('/api/earth-ships', c.req.url).toString());
  const cache = (caches as unknown as { default?: Cache }).default;
  const hit = await cache?.match(key).catch(() => undefined);
  if (hit) return hit;

  const room = c.env.SPACE.get(c.env.SPACE.idFromName(SYSTEM_SOL));
  const body = earthShips(await room.currentShips(), Date.now());
  const res = new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${SHOWCASE_REFRESH_MS / 1000}`,
    },
  });
  if (cache) c.executionCtx.waitUntil(cache.put(key, res.clone()).catch(() => undefined));
  return res;
});
