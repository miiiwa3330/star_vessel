/**
 * 訪れた天体のコレクションの API（要件 F38）。ログインが必要（匿名でよい）。
 *
 * GET  /api/visits  自分の記録すべて（初めて訪れた順）
 * POST /api/visits  訪れた（初めてなら記録する。2 回目以降は何もしない）
 */
import { Hono } from 'hono';
import { isVisitInput, MAX_VISITS_PER_PLAYER, type Visit } from '../src/world/visits';
import type { InfoKind } from '../src/world/info';
import type { AppEnv } from './index';

export const visits = new Hono<AppEnv>();

visits.get('/', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const { results } = await c.env.DB.prepare('SELECT key, kind, name, first_at FROM visits WHERE user_id = ? ORDER BY first_at')
    .bind(userId)
    .all<{ key: string; kind: string; name: string; first_at: string }>();
  const out: Visit[] = results.map((r) => ({ key: r.key, kind: r.kind as InfoKind, name: r.name, firstAt: r.first_at }));
  return c.json(out);
});

visits.post('/', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json().catch(() => null);
  if (!isVisitInput(body)) return c.json({ error: 'invalid' }, 400);
  const firstAt = new Date().toISOString();
  // 上限を超えていなければ記録する。すでにあれば何もしない（初めて訪れた時刻を残す）
  await c.env.DB.prepare(
    `INSERT INTO visits (user_id, key, kind, name, first_at)
     SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM visits WHERE user_id = ?) < ?
     ON CONFLICT (user_id, key) DO NOTHING`,
  )
    .bind(userId, body.key, body.kind, body.name, firstAt, userId, MAX_VISITS_PER_PLAYER)
    .run();
  return c.json({ ok: true });
});
