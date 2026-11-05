/**
 * 回復コードの API（要件 F51）。決まりは src/world/recovery-code.ts、仕組みは docs/tech/server.md の「回復コード」。
 *
 * GET  /api/recovery/status  自分のコードの有無（ログインが必要）
 * POST /api/recovery/code    コードを作る・作り直す。本人確認にパスワードを求める（登録したアカウントだけ）
 * POST /api/recovery/lookup  コードからユーザー名を教える（ログイン不要。コードは使い切らない）
 * POST /api/recovery/reset   コードで新しいパスワードを決める（ログイン不要。コードは新しくなる）
 *
 * コードを含む応答は、どこにも覚えさせない（no-store）。
 * パスワードのハッシュ（重い計算）は、コードが正しいと分かってから行う（誰でも呼べる API で、計算を無駄にさせないため）。
 */
import { Hono, type Context } from 'hono';
import { APIError } from 'better-auth/api';
import { isPassword } from '../src/world/account';
import {
  findByCodeStatement,
  generateRecoveryCode,
  hashRecoveryCode,
  normalizeRecoveryCode,
  resetPasswordStatements,
  saveCodeStatement,
} from '../src/world/recovery-code';
import { createAuth } from './auth';
import type { AppEnv } from './index';

export const recovery = new Hono<AppEnv>();

recovery.use('*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
});

/** 登録したアカウントのセッション。匿名やログインしていなければ null */
async function registeredSession(c: Context<AppEnv>) {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  return session && !(session.user as { isAnonymous?: boolean | null }).isAnonymous ? session : null;
}

/** 送られたコードの持ち主を探す */
async function findOwner(c: Context<AppEnv>, input: unknown) {
  const normalized = normalizeRecoveryCode(input);
  if (!normalized) return null;
  const codeHash = await hashRecoveryCode(normalized);
  const s = findByCodeStatement(codeHash);
  const row = await c.env.DB.prepare(s.sql)
    .bind(...s.params)
    .first<{ userId: string; username: string }>();
  return row ? { ...row, codeHash } : null;
}

recovery.get('/status', async (c) => {
  const session = await registeredSession(c);
  if (!session) return c.json({ error: 'unauthorized' }, 401);
  const row = await c.env.DB.prepare('SELECT created_at FROM recovery_codes WHERE user_id = ?')
    .bind(session.user.id)
    .first<{ created_at: string }>();
  return c.json({ hasCode: !!row, createdAt: row?.created_at ?? null });
});

recovery.post('/code', async (c) => {
  const session = await registeredSession(c);
  if (!session) return c.json({ error: 'unauthorized' }, 401);
  const body = (await c.req.json().catch(() => null)) as { password?: unknown } | null;
  if (typeof body?.password !== 'string') return c.json({ error: 'invalid' }, 400);
  // ログインしたままの端末を他人に触られても、コードを作り直されないように、パスワードを確かめる
  try {
    await createAuth(c.env).api.verifyPassword({ body: { password: body.password }, headers: c.req.raw.headers });
  } catch (e) {
    if (e instanceof APIError && e.status === 'BAD_REQUEST') return c.json({ error: 'wrong_password' }, 403);
    throw e;
  }
  const code = generateRecoveryCode();
  const st = saveCodeStatement(session.user.id, await hashRecoveryCode(normalizeRecoveryCode(code) as string), new Date().toISOString());
  await c.env.DB.prepare(st.sql)
    .bind(...st.params)
    .run();
  return c.json({ code });
});

recovery.post('/lookup', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { code?: unknown } | null;
  const owner = await findOwner(c, body?.code);
  if (!owner) return c.json({ error: 'invalid_code' }, 400);
  return c.json({ username: owner.username });
});

recovery.post('/reset', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { code?: unknown; password?: unknown } | null;
  if (!isPassword(body?.password)) return c.json({ error: 'invalid_password' }, 400);
  const owner = await findOwner(c, body.code);
  if (!owner) return c.json({ error: 'invalid_code' }, 400);

  const auth = createAuth(c.env);
  const passwordHash = await (await auth.$context).password.hash(body.password);
  const newCode = generateRecoveryCode();
  const newHash = await hashRecoveryCode(normalizeRecoveryCode(newCode) as string);
  const statements = resetPasswordStatements(owner.userId, owner.codeHash, newHash, passwordHash, new Date().toISOString());
  const results = await c.env.DB.batch(statements.map((s) => c.env.DB.prepare(s.sql).bind(...s.params)));
  // 最後の文で 1 行変わらなければ、同時に送られた別の要求が先にコードを使った
  if (results.at(-1)?.meta.changes !== 1) return c.json({ error: 'invalid_code' }, 400);
  return c.json({ username: owner.username, code: newCode });
});
