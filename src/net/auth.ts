/**
 * アカウント（要件 F14・F49・F52）。起動したら、登録なしの匿名のアカウントで自動的にログインする（世界の画面）。
 * 後から、ユーザー名とパスワードで登録・ログインでき、登録したあとはパスキーも足せる（準備の画面。src/top/）。
 * 匿名のときの記録は、登録・ログインのときに移る（worker/auth.ts）。
 */
import { createAuthClient } from 'better-auth/client';
import { anonymousClient, usernameClient } from 'better-auth/client/plugins';
import { passkeyClient } from '@better-auth/passkey/client';
import { accountErrorMessage, internalEmailFor, isPasskeyCancel } from '../world/account';

export const authClient = createAuthClient({ basePath: '/api/auth', plugins: [anonymousClient(), usernameClient(), passkeyClient()] });

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

/** このブラウザでパスキーが使えるか */
export const passkeySupported = (): boolean => typeof window !== 'undefined' && 'PublicKeyCredential' in window;

export interface PasskeyItem {
  id: string;
  createdAt: string | null;
}

/**
 * パスキーでサインインする。宇宙船名（ユーザー名）も入れてもらい、そのパスキーが、入れた宇宙船名のアカウントのものか確かめる
 * （2026-11-06 にオーナーの指示。パスキーだけで入れる作りは、やめた）。違えばサインアウトして、エラー。
 * 自分でやめたら false（エラーにしない）。匿名のセッションがあれば、その記録を引き継ぐ。
 * 確かめは、サインインのあとにブラウザで行う（パスキー自体が本人確認なので、宇宙船名は、入れ間違いを防ぐためのもの）
 */
export async function loginWithPasskey(username: string): Promise<boolean> {
  const res = await authClient.signIn.passkey();
  if (res.error) {
    if (isPasskeyCancel((res.error as { code?: string }).code)) return false;
    return fail(res.error);
  }
  const acc = await currentAccount();
  if (acc.kind !== 'registered' || acc.name.toLowerCase() !== username.trim().toLowerCase()) {
    await authClient.signOut();
    throw new AccountError('この宇宙船名のパスキーではありません。宇宙船名を確かめてください');
  }
  return true;
}

/** この端末のパスキーを足す。name は端末のパスキーの一覧に出る名前（ユーザー名を渡す）。自分でやめたら false */
export async function addPasskey(name: string): Promise<boolean> {
  const res = await authClient.passkey.addPasskey({ name });
  if (!res?.error) return true;
  if (isPasskeyCancel((res.error as { code?: string }).code)) return false;
  return fail(res.error);
}

export async function listPasskeys(): Promise<PasskeyItem[]> {
  const res = await authClient.passkey.listUserPasskeys();
  if (res.error) return fail(res.error);
  return (res.data ?? []).map((p) => ({ id: p.id, createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null }));
}

export async function deletePasskey(id: string): Promise<void> {
  const res = await authClient.passkey.deletePasskey({ id });
  if (res.error) fail(res.error);
}
