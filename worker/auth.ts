import { betterAuth } from 'better-auth';
import { linkStatements } from '../src/world/account-link';
import { authOptions, authPlugins } from './auth-options';

/** 匿名のアカウントの記録を、登録したアカウントへ移す（まとめて成功か失敗。要件 F49） */
async function linkAnonymousData(db: D1Database, anonymousId: string, userId: string): Promise<void> {
  if (anonymousId === userId) return;
  await db.batch(linkStatements(anonymousId, userId).map((s) => db.prepare(s.sql).bind(...s.params)));
}

/** パスキーを使えるサイト（ドメイン）とページの場所。手元の開発では、別のポートで確かめるときのページも許す。本番には効かない */
function passkeySite(baseUrl: string) {
  const url = new URL(baseUrl);
  const dev = url.hostname === 'localhost' ? [5173, 5174, 5175, 5176].map((p) => `http://localhost:${p}`) : [];
  return { rpID: url.hostname, origin: [...new Set([url.origin, ...dev])] };
}

/** リクエストごとに作る（Workers では環境変数・D1 がリクエストの中でしか手に入らないため） */
export const createAuth = (env: Env) =>
  betterAuth({
    ...authOptions,
    plugins: authPlugins(({ anonymousUser, newUser }) => linkAnonymousData(env.DB, anonymousUser.user.id, newUser.user.id), passkeySite(env.BETTER_AUTH_URL)),
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    // 手元の開発（localhost）のときだけ、別のポートで動かしたページ（人が動かしている 5173 番とは別に、AI が確かめるときなど）も許す。本番には効かない
    trustedOrigins: env.BETTER_AUTH_URL.startsWith('http://localhost') ? ['http://localhost:*'] : [],
  });

export type Auth = ReturnType<typeof createAuth>;
