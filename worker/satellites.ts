/**
 * 人工衛星の軌道要素（TLE）の API。GET /api/satellites（ログイン不要）。
 * TLE は数週間で古くなるので、リポジトリに置いた写し（public/data/satellites.json）ではなく、ここで SatNOGS から取ってくる。
 * 配布元に負担をかけないよう、取ったものを 6 時間キャッシュする（Cache API）。取れなければ 503（ブラウザは写しを使う）
 */
import { Hono } from 'hono';
import { fromSatnogs, SATNOGS_TLE_URL } from '../src/world/satellite-data';
import type { AppEnv } from './index';

const CACHE_SECONDS = 6 * 3600;

export const satellites = new Hono<AppEnv>();

satellites.get('/', async (c) => {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request('https://cache.star-vessel.invalid/api/satellites');
  const hit = await cache.match(key);
  if (hit) return hit;
  let records;
  try {
    const res = await fetch(SATNOGS_TLE_URL, { headers: { 'user-agent': 'star_vessel (+https://github.com/miiiwa3330/star_vessel)' } });
    if (!res.ok) return c.json({ error: 'upstream' }, 503);
    records = fromSatnogs(await res.json());
  } catch {
    return c.json({ error: 'upstream' }, 503);
  }
  if (records.length === 0) return c.json({ error: 'upstream' }, 503);
  const body = JSON.stringify({ source: 'SatNOGS DB (CC BY-SA 4.0)', fetchedAt: new Date().toISOString(), satellites: records });
  const response = new Response(body, {
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_SECONDS}` },
  });
  c.executionCtx.waitUntil(cache.put(key, response.clone()));
  return response;
});
