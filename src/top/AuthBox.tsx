import { useCallback, useEffect, useState } from 'react';
import { currentAccount, ensureSession, type Account } from '../net/auth';
import { AccountPanel, type AccountMode } from './AccountPanel';

/**
 * 月・火星の画面に出る、アカウントの箱（要件 F49・F55）。SIGN IN・SIGN UP を押すと月で、ログイン中のユーザー名を押すと火星で開く（火星では、ユーザー情報とサインアウト）。
 * 中身は AccountPanel（登録・ログイン・回復コード・パスキー）。カメラが着くまでは見せず（open が false）、
 * そのあいだに、アカウントを読んでおく。着いたとき、入力の欄が最初から開く。
 * ログイン・登録・サインアウトが終わると onDone、「×」・Esc・やめるで onClose。どちらも、地球へ戻ってタイトル画面に戻る。
 * 開いたとき、登録なしのアカウントを作る（匿名のときの記録を、登録・ログインのときに移すため。タイトル画面を見るだけでは作らない）。
 */
export function AuthBox({ open, initialMode, onDone, onClose }: { open: boolean; initialMode?: AccountMode; onDone: () => void; onClose: () => void }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [offline, setOffline] = useState(false);
  /** 一度見せたら、閉じる動き（薄くなる）の間も、中身を残す */
  const [revealed, setRevealed] = useState(false);

  const load = useCallback(async () => {
    try {
      await ensureSession();
      setAccount(await currentAccount());
      setOffline(false);
    } catch (e) {
      console.error(e);
      setOffline(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (open) setRevealed(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // 回復コードの画面（<dialog>）が開いているときの Esc は、そちらの決まりに任せる（保存するまで閉じない）
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className={`top-auth-box${open ? ' is-open' : ''}`} role="dialog" aria-modal="false" aria-label="アカウント" aria-hidden={!open}>
      <div className="top-card">
        <button type="button" className="top-auth-close" onClick={onClose} aria-label="閉じる" tabIndex={open ? 0 : -1}>
          ×
        </button>
        {revealed && account && <AccountPanel account={account} onChanged={() => void load()} initialMode={initialMode} onComplete={onDone} onCancel={onClose} />}
        {revealed && !account && offline && <p className="top-error" role="alert">サーバーにつながらないため、アカウントは使えません。</p>}
        {revealed && !account && !offline && <p className="top-hint" role="status">読み込んでいます…</p>}
      </div>
    </div>
  );
}
