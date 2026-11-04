/**
 * サーバーの入口（Cloudflare Workers）。/api/ だけをここで受け、それ以外は静的なファイル（wrangler.jsonc の assets）。
 * 構成と決まりは docs/tech/server.md。
 */
import { Hono } from 'hono';
import { createAuth } from './auth';
import { warps } from './warps';
import { ships } from './ships';
import { isSystemCode } from '../src/world/address';

export { SpaceRoom } from './space-room';

export interface AppEnv {
  Bindings: Env;
  Variables: { userId: string | null };
}

const app = new Hono<AppEnv>();

app.on(['GET', 'POST'], '/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw));

app.use('/api/warps/*', async (c, next) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  c.set('userId', session?.user.id ?? null);
  await next();
});
app.route('/api/warps', warps);

app.use('/api/ship', async (c, next) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  c.set('userId', session?.user.id ?? null);
  await next();
});
app.route('/api/ship', ships);

/**
 * 宇宙の部屋への WebSocket。部屋は恒星系ごと（例：/api/space/SOL）。ログインが必要（匿名でよい）。
 * アカウントの ID は、部屋（Durable Object）に x-user-id で渡す。ブラウザから来た x-user-id は使わない
 */
app.get('/api/space/:system', async (c) => {
  if (c.req.header('Upgrade') !== 'websocket') return c.json({ error: 'expected_websocket' }, 426);
  const system = c.req.param('system');
  if (!isSystemCode(system)) return c.json({ error: 'invalid' }, 400);
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'unauthorized' }, 401);
  const headers = new Headers(c.req.raw.headers);
  headers.set('x-user-id', session.user.id);
  const room = c.env.SPACE.get(c.env.SPACE.idFromName(system));
  return room.fetch(new Request(c.req.raw, { headers }));
});

app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

export default app;
