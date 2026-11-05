/**
 * この端末で最後に使ったユーザー名（要件 F51）。ログインの欄に最初から入れておく。
 * ユーザー名は秘密ではないので、端末に覚えておく。パスワードは覚えない（ブラウザのパスワード管理に任せる）。
 * localStorage が使えない環境では、何もしない。
 */
const KEY = 'star_vessel.lastUsername';

export function lastUsername(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberUsername(username: string): void {
  try {
    localStorage.setItem(KEY, username);
  } catch {
    // 覚えられなくても動く
  }
}
