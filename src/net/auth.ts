/**
 * アカウント（要件 F14・F49）。起動したら、登録なしの匿名のアカウントで自動的にログインする（世界の画面）。
 * 後から、ユーザー名とパスワードで登録・ログインできる（準備の画面。src/top/）。
 * 匿名のときの記録は、登録・ログインのときに移る（worker/auth.ts）。
 */
import { createAuthClient } from 'better-auth/client';
import { anonymousClient, usernameClient } from 'better-auth/client/plugins';
import { accountErrorMessage, internalEmailFor } from '../world/account';

export const authClient = createAuthClient({ basePath: '/api/auth', plugins: [anonymousClient(), usernameClient()] });

/** ログインしていなければ、匿名でログインする */
export async function ensureSession(): Promise<void> {
  const { data } = await authClient.getSession();
  if (data) return;
  const res = await authClient.signIn.anonymous();
  if (res.error) throw new Error(`匿名のログインに失敗: ${res.error.message ?? res.error.status}`);
}

/** いまのアカウント。none：ログインしていない、anonymous：登録なしで遊んでいる、registered：登録している */
export type Account =
  | { kind: 'none' }
  | { kind: 'anonymous'; userId: string }
  | { kind: 'registered'; userId: string; name: string };

export async function currentAccount(): Promise<Account> {
  const { data } = await authClient.getSession();
  if (!data) return { kind: 'none' };
  const user = data.user as { id: string; name: string; isAnonymous?: boolean | null; displayUsername?: string | null; username?: string | null };
  if (user.isAnonymous) return { kind: 'anonymous', userId: user.id };
  return { kind: 'registered', userId: user.id, name: user.displayUsername ?? user.username ?? user.name };
}

/** 画面に出せる日本語の理由を持つエラー */
export class AccountError extends Error {}

const fail = (e: { code?: string; status?: number } | null | undefined): never => {
  throw new AccountError(accountErrorMessage(e?.code, e?.status));
};

/** ユーザー名とパスワードで登録する。匿名のセッションがあれば、その記録を引き継ぐ */
export async function registerAccount(username: string, password: string): Promise<void> {
  const res = await authClient.signUp.email({ email: internalEmailFor(username), password, name: username, username });
  if (res.error) fail(res.error);
}

/** ユーザー名とパスワードでログインする。匿名のセッションがあれば、その記録を引き継ぐ */
export async function loginAccount(username: string, password: string): Promise<void> {
  const res = await authClient.signIn.username({ username, password });
  if (res.error) fail(res.error);
}

export async function logoutAccount(): Promise<void> {
  const res = await authClient.signOut();
  if (res.error) fail(res.error);
}
