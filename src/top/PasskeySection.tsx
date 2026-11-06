import { useCallback, useEffect, useState } from 'react';
import { AccountError, addPasskey, deletePasskey, listPasskeys, passkeySupported, type PasskeyItem } from '../net/auth';
import { formatDateSlash } from './format-date';

const GENERIC = 'うまくいきませんでした。しばらくしてからもう一度お試しください';

/**
 * パスキー（要件 F52）。登録したアカウントに足す。足すと、パスワードの代わりに、端末の指紋・顔認証などでサインインできる（宇宙船名は入れる）。
 * 指紋や顔の情報、秘密鍵は端末から出ない。サーバーが持つのは公開鍵だけ。
 */
export function PasskeySection({ username }: { username: string }) {
  const [items, setItems] = useState<PasskeyItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 消す確認をしている鍵 */
  const [confirming, setConfirming] = useState<string | null>(null);

  const reload = useCallback(async () => setItems(await listPasskeys()), []);
  useEffect(() => {
    reload().catch(() => setItems(null));
  }, [reload]);

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof AccountError ? e.message : GENERIC);
    } finally {
      setBusy(false);
    }
  };

  if (!passkeySupported() || items === null) return null;
  return (
    <div className="top-form" data-testid="passkeys">
      {/* 宇宙船名・回復コードと同じ、小さな見出し。足した鍵は、回復コードと同じ「Created [日付]」（緑）で並べる（2026-11-06 にオーナーの指示） */}
      <div className="top-code-row">
        <span className="top-code-label">{'{パスキー}'}</span>
        {items.length === 0 && <span className="top-code-status is-empty">Not created</span>}
      </div>
      {items.map((p, i) => (
        <div key={p.id} className="top-row top-passkey">
          <span className="top-code-status" aria-label={`パスキー ${i + 1}`}>
            Created{p.createdAt ? ` [${formatDateSlash(p.createdAt)}]` : ''}
          </span>
          {confirming === p.id ? (
            <>
              <button
                type="button"
                className="top-button top-button-small"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await deletePasskey(p.id);
                    setConfirming(null);
                    await reload();
                  })
                }
              >
                本当に消す
              </button>
              <button type="button" className="top-button top-button-small top-button-quiet" disabled={busy} onClick={() => setConfirming(null)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="top-button top-button-small top-button-quiet" disabled={busy} onClick={() => setConfirming(p.id)}>
              消す
            </button>
          )}
        </div>
      ))}
      <div className="top-row">
        <button
          type="button"
          className="top-link"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              if (await addPasskey(username)) await reload();
            })
          }
        >
          {busy ? '待っています…' : 'Add pass-key'}
        </button>
      </div>
      <p className="top-hint">
        パスキーを足すと、パスワードの代わりに、この端末の指紋・顔認証などでサインインできます（宇宙船名は入れます）。指紋や顔の情報はサーバーに送られません。
      </p>
      {error && <p className="top-error" role="alert">{error}</p>}
    </div>
  );
}
