/**
 * アカウント（要件 F14）。起動したら、登録なしの匿名のアカウントで自動的にログインする。
 * 後から登録する画面は、まだ無い（docs/tech/server.md）。
 */
import { createAuthClient } from 'better-auth/client';
import { anonymousClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({ basePath: '/api/auth', plugins: [anonymousClient()] });

/** ログインしていなければ、匿名でログインする */
export async function ensureSession(): Promise<void> {
  const { data } = await authClient.getSession();
  if (data) return;
  const res = await authClient.signIn.anonymous();
  if (res.error) throw new Error(`匿名のログインに失敗: ${res.error.message ?? res.error.status}`);
}
