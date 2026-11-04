import { betterAuth } from 'better-auth';
import { authOptions } from './auth-options';

/** リクエストごとに作る（Workers では環境変数・D1 がリクエストの中でしか手に入らないため） */
export const createAuth = (env: Env) =>
  betterAuth({ ...authOptions, database: env.DB, secret: env.BETTER_AUTH_SECRET, baseURL: env.BETTER_AUTH_URL });

export type Auth = ReturnType<typeof createAuth>;
