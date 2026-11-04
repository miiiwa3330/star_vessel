/**
 * サーバーの入口（Cloudflare Workers）。/api/ だけをここで受け、それ以外は静的なファイル（wrangler.jsonc の assets）。
 * 構成と決まりは docs/tech/server.md。
 */
import { Hono } from 'hono';
import { createAuth } from './auth';
import { warps } from './warps';

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

app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

export default app;
