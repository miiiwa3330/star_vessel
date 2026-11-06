import { useEffect, useState } from 'react';
import { fetchSignedInName } from '../net/session';

export type AuthMode = 'login' | 'register';

/**
 * タイトル画面の右上の、SIGN IN と SIGN UP（要件 F55。2026-11-06 にオーナーの指示）。
 * 押すと、カメラが月まで飛び、アカウントの箱（AuthBox）が、ログイン（または登録）の入力の状態で開く。
 * 登録したアカウントでログインしているときは、2 つのボタンの代わりに、ユーザー名を出す（押すと、カメラが火星まで飛び、ユーザー情報の箱が開く（サインアウト・回復コード・パスキー））。
 * 読み込めるまでは、何も出さない（ボタンが一瞬出て、消えるのを避けるため）。
 * version が変わるたびに読み直す（箱でサインイン・サインアウトしたあと、タイトル画面に戻ったときに、表示を合わせる）。
 * away：月へ飛んでいる間・箱が開いている間は、隠す
 */
export function AuthLinks({
  onAuth,
  version,
  away,
  onSignedIn,
}: {
  onAuth: (mode?: AuthMode) => void;
  version: number;
  away: boolean;
  /** サインインしているか分かったとき（サインインしていれば、火星の準備を先に済ませるため） */
  onSignedIn?: (signedIn: boolean) => void;
}) {
  // undefined：確かめている途中、null：ログインしていない
  const [name, setName] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void fetchSignedInName().then((n) => {
      if (!alive) return;
      setName(n);
      onSignedIn?.(n !== null);
    });
    return () => {
      alive = false;
    };
  }, [version]);

  if (name === undefined) return null;
  return (
    <nav className={`top-auth${away ? ' is-away' : ''}`} aria-label="アカウント" aria-hidden={away}>
      {name ? (
        <button type="button" className="top-auth-button top-auth-user" onClick={() => onAuth()} title="アカウント" tabIndex={away ? -1 : 0}>
          {name}
        </button>
      ) : (
        <>
          <button type="button" className="top-auth-button" onClick={() => onAuth('login')} tabIndex={away ? -1 : 0}>
            SIGN IN
          </button>
          <button type="button" className="top-auth-button top-auth-outline" onClick={() => onAuth('register')} tabIndex={away ? -1 : 0}>
            SIGN UP
          </button>
        </>
      )}
    </nav>
  );
}
