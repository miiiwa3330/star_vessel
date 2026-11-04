/**
 * 宇宙船の設計の API（要件 F27）。ログインが必要（匿名でよい）。
 *
 * GET /api/ship  自分の設計（まだ決めていなければ null）
 * PUT /api/ship  自分の設計を保存する
 */
import { Hono } from 'hono';
import { isShipDesign, type ShipDesign } from '../src/world/ship-design';
import type { AppEnv } from './index';

export const ships = new Hono<AppEnv>();

ships.get('/', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const row = await c.env.DB.prepare('SELECT design FROM ship_designs WHERE user_id = ?')
    .bind(userId)
    .first<{ design: string }>();
  let design: ShipDesign | null = null;
  if (row) {
    const parsed: unknown = JSON.parse(row.design);
    design = isShipDesign(parsed) ? parsed : null;
  }
  return c.json({ design });
});

ships.put('/', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json().catch(() => null);
  if (!isShipDesign(body)) return c.json({ error: 'invalid' }, 400);
  const design: ShipDesign = { v: body.v, hull: body.hull };
  await c.env.DB.prepare(
    `INSERT INTO ship_designs (user_id, design, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET design = excluded.design, updated_at = excluded.updated_at`,
  )
    .bind(userId, JSON.stringify(design), new Date().toISOString())
    .run();
  return c.json({ design });
});
