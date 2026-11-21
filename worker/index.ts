/**
 * サーバーの入口（Cloudflare Workers）。/api/ だけをここで受け、それ以外は静的なファイル（wrangler.jsonc の assets）。
 * 構成と決まりは docs/tech/server.md。
 */
import { Hono } from 'hono';
import { createAuth } from './auth';
import { warps } from './warps';
import { ships } from './ships';
import { satellites } from './satellites';
import { visits } from './visits';
import { presence } from './presence';
import { recovery } from './recovery';
import { showcase } from './showcase';
import { isUsername } from '../src/world/account';
import { isSystemCode } from '../src/world/address';
import { API_SECURITY_HEADERS, clientIpKey, isOriginAllowedForRequest } from '../src/world/http-security';

export { SpaceRoom } from './space-room';

export interface AppEnv {
  Bindings: Env;
  Variables: { userId: string | null };
}

const app = new Hono<AppEnv>();

function pickLimiter(env: Env, method: string, path: string): { limiter: RateLimit; prefix: string } | null {
  if (method === 'POST' && path === '/api/auth/sign-in/anonymous' && env.ANON_LIMITER) {
    return { limiter: env.ANON_LIMITER, prefix: 'anon' };
  }
  if (
    method === 'POST' &&
    (path.startsWith('/api/auth/sign-in/') || path.startsWith('/api/auth/sign-up/') || path.startsWith('/api/auth/passkey/') || path.startsWith('/api/recovery/')) &&
    env.AUTH_LIMITER
  ) {
    return { limiter: env.AUTH_LIMITER, prefix: 'auth' };
  }
  if (
    env.API_WRITE_LIMITER &&
    ((path.startsWith('/api/warps') && (method === 'POST' || method === 'DELETE')) ||
      (path === '/api/ship' && method === 'PUT') ||
      (path === '/api/visits' && method === 'POST') ||
      (path.startsWith('/api/space/') && method === 'GET'))
  ) {
    return { limiter: env.API_WRITE_LIMITER, prefix: 'write' };
  }
  return null;
}

app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  // Better Auth 外の状態変更 API と WebSocket 接続について送信元オリジンを検証する（CSRF / CSWSH 対策）
  if (
    !path.startsWith('/api/auth/') &&
    !isOriginAllowedForRequest(c.req.method, c.req.header('origin') ?? null, c.req.header('upgrade') ?? null, c.env.BETTER_AUTH_URL)
  ) {
    return c.json({ error: 'forbidden_origin' }, 403);
  }
  const chosen = pickLimiter(c.env, c.req.method, path);
  if (chosen) {
    const { success } = await chosen.limiter.limit({ key: `${chosen.prefix}:${clientIpKey(c.req.raw)}` });
    if (!success) {
      c.header('retry-after', '60');
      return c.json({ error: 'rate_limited' }, 429);
    }
  }
  await next();
  if (c.res.status !== 101) {
    try {
      for (const [k, v] of Object.entries(API_SECURITY_HEADERS)) {
        if (!c.res.headers.has(k)) c.res.headers.set(k, v);
      }
    } catch {
      const headers = new Headers(c.res.headers);
      for (const [k, v] of Object.entries(API_SECURITY_HEADERS)) {
        if (!headers.has(k)) headers.set(k, v);
      }
      c.res = new Response(c.res.body, { status: c.res.status, statusText: c.res.statusText, headers });
    }
  }
});

app.on(['GET', 'POST'], '/api/auth/*', (c) => {
  const rawExpected = c.req.header('x-passkey-username');
  const expected = rawExpected && isUsername(rawExpected) ? rawExpected : null;
  return createAuth(c.env, expected).handler(c.req.raw);
});

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
app.route('/api/satellites', satellites);
app.route('/api/presence', presence);
app.route('/api/recovery', recovery);
app.route('/api/earth-ships', showcase);

app.use('/api/visits', async (c, next) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  c.set('userId', session?.user.id ?? null);
  await next();
});
app.route('/api/visits', visits);

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
  // チャットに出す宇宙船名（要件 F6）。サインアップしていない（匿名の）人は無し。ブラウザから来た x-user-name は使わない
  const u = session.user as { username?: string | null; displayUsername?: string | null; isAnonymous?: boolean | null };
  const name = u.displayUsername || u.username;
  if (name && !u.isAnonymous) headers.set('x-user-name', name);
  else headers.delete('x-user-name');
  headers.set('x-room', system);
  const room = c.env.SPACE.get(c.env.SPACE.idFromName(system));
  return room.fetch(new Request(c.req.raw, { headers }));
});

app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

export default app;
