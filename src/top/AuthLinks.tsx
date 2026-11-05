import { useEffect, useState } from 'react';
import { fetchSignedInName } from '../net/session';

export type AuthMode = 'login' | 'register';

/**
 * タイトル画面の右上の、SIGN IN と SIGN UP（要件 F55。2026-11-06 にオーナーの指示）。
 * 押すと、準備画面へ進み、アカウントの欄を、ログイン（または登録）の入力の状態で開く（登録・ログインの画面は、準備画面にある。
 * 登録のあとの回復コードの画面などを、そのまま使うため）。
 * 登録したアカウントでログインしているときは、2 つのボタンの代わりに、ユーザー名を出す（押すと、準備画面へ）。
 * 読み込めるまでは、何も出さない（ボタンが一瞬出て、消えるのを避けるため）。
 */
export function AuthLinks({ onAuth }: { onAuth: (mode?: AuthMode) => void }) {
  // undefined：確かめている途中、null：ログインしていない
  const [name, setName] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void fetchSignedInName().then((n) => alive && setName(n));
    return () => {
      alive = false;
    };
  }, []);

  if (name === undefined) return null;
  return (
    <nav className="top-auth" aria-label="アカウント">
      {name ? (
        <button type="button" className="top-auth-button top-auth-user" onClick={() => onAuth()} title="準備画面へ">
          {name}
        </button>
      ) : (
        <>
          <button type="button" className="top-auth-button" onClick={() => onAuth('login')}>
            SIGN IN
          </button>
          <button type="button" className="top-auth-button top-auth-outline" onClick={() => onAuth('register')}>
            SIGN UP
          </button>
        </>
      )}
    </nav>
  );
}
