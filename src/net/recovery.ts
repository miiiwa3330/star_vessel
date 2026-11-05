/**
 * 回復コードの API（サーバーの /api/recovery。worker/recovery.ts）。要件 F51。
 * 失敗は、画面に出せる日本語の AccountError にする。
 */
import { AccountError } from './auth';

const GENERIC = 'うまくいきませんでした。しばらくしてからもう一度お試しください';

async function post<T>(path: string, body: unknown, messages: Record<string, string>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/recovery/${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AccountError(GENERIC);
  }
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !json) throw new AccountError(messages[json?.error ?? ''] ?? GENERIC);
  return json;
}

const WRONG_CODE = '回復コードが違います。すでに使ったコードは使えません';

export interface RecoveryStatus {
  hasCode: boolean;
  createdAt: string | null;
}

export const recoveryApi = {
  /** 自分のコードの有無。読めなければ null（画面は何も言わない） */
  async status(): Promise<RecoveryStatus | null> {
    try {
      const res = await fetch('/api/recovery/status', { credentials: 'same-origin' });
      return res.ok ? ((await res.json()) as RecoveryStatus) : null;
    } catch {
      return null;
    }
  },

  /** コードを作る・作り直す（前のコードは使えなくなる） */
  async create(password: string): Promise<string> {
    const r = await post<{ code: string }>('code', { password }, { wrong_password: 'パスワードが違います' });
    return r.code;
  },

  /** コードからユーザー名を教えてもらう */
  async lookup(code: string): Promise<string> {
    const r = await post<{ username: string }>('lookup', { code }, { invalid_code: WRONG_CODE });
    return r.username;
  },

  /** コードで新しいパスワードを決める。ユーザー名と、新しいコードが返る */
  reset(code: string, password: string): Promise<{ username: string; code: string }> {
    return post('reset', { code, password }, { invalid_code: WRONG_CODE });
  },
};
