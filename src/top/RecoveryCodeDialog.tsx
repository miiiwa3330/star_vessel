import { useEffect, useRef, useState } from 'react';

/** 保存するファイルの中身 */
export const recoveryFileText = (code: string): string =>
  [
    'STAR VESSEL の回復コード',
    '',
    code,
    '',
    'ユーザー名やパスワードを忘れたときに、準備画面の「ログイン」→「ユーザー名やパスワードを忘れたとき」で入力します。',
    'このコードを知っている人は、あなたのアカウントに入れます。人に見せないでください。',
    '',
  ].join('\n');

/**
 * 回復コードを 1 回だけ見せる画面（要件 F51）。保存したと確かめるまで閉じられない。
 * サーバーはコードを持っていないので、閉じると二度と見られない（パスワードで作り直すことはできる）。
 * ブラウザの <dialog> を使う（開いている間は、後ろの画面を触れず、Tab も中だけを回る）。
 */
export function RecoveryCodeDialog({ code, onClose }: { code: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([recoveryFileText(code)], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'star-vessel-recovery-code.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <dialog
      ref={ref}
      className="top-dialog"
      aria-labelledby="top-recovery-title"
      // Esc で閉じない（保存を確かめる前に、コードが見られなくなるため）
      onCancel={(e) => e.preventDefault()}
    >
      <h2 id="top-recovery-title" className="top-heading">回復コードを保存してください</h2>
      <p className="top-line">
        ユーザー名やパスワードを忘れたときは、このコードで戻せます。<strong>ここで閉じると、二度と表示できません。</strong>
      </p>
      <p className="top-code" data-testid="recovery-code">{code}</p>
      <div className="top-row">
        <button type="button" className="top-button top-button-small" onClick={copy}>
          {copied ? 'コピーしました' : 'コピーする'}
        </button>
        <button type="button" className="top-button top-button-small" onClick={download}>
          ファイルに保存する
        </button>
      </div>
      <p className="top-hint">パスワード管理のアプリや、紙に書いて保管するのがおすすめです。このコードを知っている人は、あなたのアカウントに入れます。</p>
      <label className="top-check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <span>保存しました</span>
      </label>
      <div className="top-row top-row-end">
        <button type="button" className="top-button" disabled={!saved} onClick={onClose}>
          閉じる
        </button>
      </div>
    </dialog>
  );
}
