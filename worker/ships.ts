/**
 * 宇宙船の設計の API（要件 F27）。
 *
 * GET /api/ship              自分の設計（まだ決めていなければ null）と、使っている自分で作った船の印（ref）。ログインが必要（匿名でよい）
 * PUT /api/ship              自分の設計を保存する。ログインが必要
 * GET /api/ship/blocks/:ref  印（ref）の船のブロック。ログインは要らない（見た目だけのもの。中身が変わらないので、長く覚えてよい）
 *
 * 決まりは docs/tech/ships.md。
 */
import { Hono } from 'hono';
import { PRIVATE_NO_STORE, readJsonWithLimit } from '../src/world/http-security';
import { isBlocksRef } from '../src/world/ship-blocks';
import { canonicalizeShipDesign, parseShipDesign, usedCustom, type ShipDesign } from '../src/world/ship-design';
import type { AppEnv } from './index';

export const ships = new Hono<AppEnv>();
const MAX_SHIP_BODY_BYTES = 262_144;

const cacheOf = (): Cache | undefined => (caches as unknown as { default?: Cache }).default;
const blocksCacheKey = (ref: string) => new Request(`https://cache.star-vessel.invalid/api/ship/blocks/${ref}`);

/** ブロックの文字列の印：SHA-256 の前の 16 バイト（16 進 32 文字） */
async function blocksRef(blocks: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(blocks));
  return [...new Uint8Array(digest).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

ships.get('/', async (c) => {
  c.header('cache-control', PRIVATE_NO_STORE);
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const row = await c.env.DB.prepare('SELECT design, blocks_ref FROM ship_designs WHERE user_id = ?')
    .bind(userId)
    .first<{ design: string; blocks_ref: string | null }>();
  let design: ShipDesign | null = null;
  if (row) {
    try {
      design = parseShipDesign(JSON.parse(row.design));
    } catch {
      design = null;
    }
  }
  return c.json({ design, ref: usedCustom(design) ? (row?.blocks_ref ?? null) : null });
});

ships.put('/', async (c) => {
  c.header('cache-control', PRIVATE_NO_STORE);
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const read = await readJsonWithLimit(c.req.raw, MAX_SHIP_BODY_BYTES);
  if (!read.ok) return c.json({ error: read.reason }, read.reason === 'too_large' ? 413 : 400);
  const design = canonicalizeShipDesign(read.data);
  if (!design) return c.json({ error: 'invalid' }, 400);
  // 印は、いま使っている自分の船の分だけ（宇宙の部屋で配るのは、使っている船だけ）
  const used = usedCustom(design);
  const ref = used ? await blocksRef(used) : null;
  await c.env.DB.prepare(
    `INSERT INTO ship_designs (user_id, design, blocks_ref, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET design = excluded.design, blocks_ref = excluded.blocks_ref, updated_at = excluded.updated_at`,
  )
    .bind(userId, JSON.stringify(design), ref, new Date().toISOString())
    .run();
  const cache = ref ? cacheOf() : undefined;
  if (ref && cache) c.executionCtx.waitUntil(cache.delete(blocksCacheKey(ref)).catch(() => false));
  return c.json({ design, ref });
});

ships.get('/blocks/:ref', async (c) => {
  const ref = c.req.param('ref');
  if (!isBlocksRef(ref)) return c.json({ error: 'invalid' }, 400);
  const cache = cacheOf();
  const key = blocksCacheKey(ref);
  const hit = await cache?.match(key).catch(() => undefined);
  if (hit) return hit;

  const row = await c.env.DB.prepare('SELECT design FROM ship_designs WHERE blocks_ref = ? LIMIT 1').bind(ref).first<{ design: string }>();
  let blocks: string | undefined;
  try {
    blocks = row ? (usedCustom(parseShipDesign(JSON.parse(row.design))) ?? undefined) : undefined;
  } catch {
    blocks = undefined;
  }
  if (!blocks) {
    const miss = new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' },
    });
    if (cache) c.executionCtx.waitUntil(cache.put(key, miss.clone()).catch(() => undefined));
    return miss;
  }
  // 印は中身から作るので、同じ印の中身は変わらない
  const res = new Response(JSON.stringify({ blocks }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=31536000, immutable' },
  });
  if (cache) c.executionCtx.waitUntil(cache.put(key, res.clone()).catch(() => undefined));
  return res;
});
