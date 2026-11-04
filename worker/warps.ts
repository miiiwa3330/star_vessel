/**
 * ワープホールの API（要件 F9・F12・F13）。
 *
 * GET    /api/warps      全員のワープホール
 * POST   /api/warps      置く（ログインが必要。匿名でよい）。住所の番号はここで振る
 * DELETE /api/warps/:id  消す（置いた本人だけ）
 */
import { Hono } from 'hono';
import { addressCode, addressPrefix } from '../src/world/address';
import { isWarpPlacement, MAX_WARPS_PER_PLAYER, type WarpHole } from '../src/world/warp-schema';
import type { BodyId } from '../src/world/solar-system';
import type { AppEnv } from './index';

interface WarpRow {
  id: string;
  owner_id: string;
  code: string;
  anchor: string;
  offset_x: number;
  offset_y: number;
  offset_z: number;
  facing_x: number;
  facing_y: number;
  facing_z: number;
  created_at: string;
}

const COLUMNS = 'id, owner_id, code, anchor, offset_x, offset_y, offset_z, facing_x, facing_y, facing_z, created_at';
/** 一度に返す数の上限。全員分を返すのは、ワープホールが少ないうちだけの作り（docs/tech/server.md） */
const LIST_LIMIT = 1000;

const toWarp = (r: WarpRow, userId: string | null): WarpHole => ({
  id: r.id,
  code: r.code,
  anchor: r.anchor as BodyId,
  offsetKm: { x: r.offset_x, y: r.offset_y, z: r.offset_z },
  facing: { x: r.facing_x, y: r.facing_y, z: r.facing_z },
  createdAt: r.created_at,
  mine: r.owner_id === userId,
});

export const warps = new Hono<AppEnv>();

warps.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT ${COLUMNS} FROM warps ORDER BY created_at LIMIT ?`)
    .bind(LIST_LIMIT)
    .all<WarpRow>();
  return c.json(results.map((r) => toWarp(r, c.get('userId'))));
});

warps.post('/', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json().catch(() => null);
  if (!isWarpPlacement(body)) return c.json({ error: 'invalid' }, 400);

  const id = crypto.randomUUID();
  const prefix = addressPrefix(body.anchor, body.system, body.arm);
  const now = new Date().toISOString();
  const underLimit = '(SELECT COUNT(*) FROM warps WHERE owner_id = ?) < ?';
  // batch は 1 つのトランザクションで順に動く。上限の確かめ・番号を振る・置く、を同時に行い、重なりや上限の超えを防ぐ
  const [, inserted] = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO warp_counters (prefix, last) SELECT ?, 1 WHERE ${underLimit}
       ON CONFLICT (prefix) DO UPDATE SET last = last + 1`,
    ).bind(prefix, userId, MAX_WARPS_PER_PLAYER),
    c.env.DB.prepare(
      `INSERT INTO warps (id, owner_id, code, prefix, serial, anchor, offset_x, offset_y, offset_z, facing_x, facing_y, facing_z, created_at)
       SELECT ?, ?, ? || '-' || printf('%03d', last), prefix, last, ?, ?, ?, ?, ?, ?, ?, ?
       FROM warp_counters WHERE prefix = ? AND ${underLimit}`,
    ).bind(
      id,
      userId,
      prefix,
      body.anchor,
      body.offsetKm.x,
      body.offsetKm.y,
      body.offsetKm.z,
      body.facing.x,
      body.facing.y,
      body.facing.z,
      now,
      prefix,
      userId,
      MAX_WARPS_PER_PLAYER,
    ),
  ]);
  if (!inserted.meta.changes) return c.json({ error: 'limit', limit: MAX_WARPS_PER_PLAYER }, 409);

  const row = await c.env.DB.prepare(`SELECT ${COLUMNS} FROM warps WHERE id = ?`).bind(id).first<WarpRow>();
  if (!row) return c.json({ error: 'not_found' }, 500);
  // 番号の付け方がブラウザ側の決まり（addressCode）と同じであることを確かめておく
  if (row.code !== addressCode(prefix, Number(row.code.split('-').at(-1)))) return c.json({ error: 'code' }, 500);
  return c.json(toWarp(row, userId), 201);
});

warps.delete('/:id', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const res = await c.env.DB.prepare('DELETE FROM warps WHERE id = ? AND owner_id = ?')
    .bind(c.req.param('id'), userId)
    .run();
  if (!res.meta.changes) return c.json({ error: 'not_found' }, 404);
  return c.body(null, 204);
});
