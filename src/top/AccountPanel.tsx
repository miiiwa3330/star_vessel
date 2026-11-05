import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AccountError, loginAccount, loginWithPasskey, logoutAccount, passkeySupported, registerAccount, type Account } from '../net/auth';
import { recoveryApi, type RecoveryStatus } from '../net/recovery';
import { credentialProblem, passwordProblem, PASSWORD_MAX, PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from '../world/account';
import { normalizeRecoveryCode } from '../world/recovery-code';
import { formatDateJa } from './format-date';
import { lastUsername, rememberUsername } from './last-username';
import { PasskeySection } from './PasskeySection';
import { RecoveryCodeDialog } from './RecoveryCodeDialog';

/** closed：閉じている、register・login：入力、recover：回復コードで戻す、code：登録したあとに回復コードを作る・作り直す */
type Mode = 'closed' | 'register' | 'login' | 'recover' | 'code';

/** 開いたときに、最初から開いておく入力（タイトル画面の SIGN IN・SIGN UP から来たとき） */
export type AccountMode = 'login' | 'register';

const GENERIC = 'うまくいきませんでした。しばらくしてからもう一度お試しください';
const messageOf = (e: unknown): string => (e instanceof AccountError ? e.message : GENERIC);

/**
 * アカウント（要件 F14・F49・F51）。登録しなくても遊べる。登録（ユーザー名とパスワード）すると、
 * ほかの端末でも続きから遊べ、いまの記録（宇宙船・ワープホール・訪れた天体）も引き継がれる。
 * メールアドレスは集めないので、忘れたときに戻す手段は、登録のあとに 1 回だけ見せる回復コード。
 */
export function AccountPanel({ account, onChanged, initialMode }: { account: Account; onChanged: () => void; initialMode?: AccountMode }) {
  const [mode, setMode] = useState<Mode>(initialMode ?? 'closed');
  const [username, setUsername] = useState(() => (initialMode === 'login' ? lastUsername() : ''));
  const sectionRef = useRef<HTMLElement>(null);
  // タイトル画面から来て、入力が最初から開いているときは、画面の中に入れる（スマホで、下にあるため）
  useEffect(() => {
    if (initialMode) sectionRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
  }, [initialMode]);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** 回復：入力中のコードと、コードで分かったユーザー名 */
  const [code, setCode] = useState('');
  const [found, setFound] = useState<string | null>(null);
  /** いま見せている回復コード（1 回だけ） */
  const [shownCode, setShownCode] = useState<string | null>(null);
  const [status, setStatus] = useState<RecoveryStatus | null>(null);

  const userId = account.kind === 'registered' ? account.userId : null;
  const registeredName = account.kind === 'registered' ? account.name : null;
  // パスキーでログインしたときも含めて、この端末で最後に使った名前を覚える
  useEffect(() => {
    if (registeredName) rememberUsername(registeredName);
  }, [registeredName]);
  useEffect(() => {
    let alive = true;
    setStatus(null);
    if (userId) void recoveryApi.status().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, [userId]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setPassword('');
    setError(null);
    setNotice(null);
    if (next === 'login' && !username) setUsername(lastUsername());
    if (next === 'recover') {
      setCode('');
      setFound(null);
    }
  };

  /** 送るときの共通の処理（二重に送らない・エラーを出す） */
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const submitCredentials = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'register') {
      const problem = credentialProblem(username, password);
      if (problem) return setError(problem);
    }
    void run(async () => {
      if (mode === 'register') {
        await registerAccount(username, password);
        // 登録はできたので、コードが作れなくても続ける（登録したあとの画面から作り直せる）
        await recoveryApi.create(password).then(setShownCode, (err: unknown) => console.error(err));
      } else {
        await loginAccount(username, password);
      }
      switchMode('closed');
      setUsername('');
      onChanged();
    });
  };

  const lookupCode = (e: FormEvent) => {
    e.preventDefault();
    if (!normalizeRecoveryCode(code)) return setError('回復コードは 20 文字です。もう一度確かめてください');
    void run(async () => setFound(await recoveryApi.lookup(code)));
  };

  const resetPassword = (e: FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    void run(async () => {
      const r = await recoveryApi.reset(code, password);
      // ここで古いコードは使えなくなっている。新しいコードは、何があっても見せる
      setShownCode(r.code);
      rememberUsername(r.username);
      const newPassword = password;
      switchMode('closed');
      setUsername('');
      try {
        await loginAccount(r.username, newPassword);
        onChanged();
      } catch {
        setNotice('パスワードを決め直しました。新しいパスワードでログインしてください');
      }
    });
  };

  const createCode = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const c = await recoveryApi.create(password);
      setShownCode(c);
      switchMode('closed');
      setStatus({ hasCode: true, createdAt: new Date().toISOString() });
    });
  };

  const passkeyLogin = () =>
    void run(async () => {
      if (!(await loginWithPasskey())) return;
      switchMode('closed');
      setUsername('');
      onChanged();
    });

  const logout = () =>
    void run(async () => {
      await logoutAccount();
      switchMode('closed');
      onChanged();
    });

  const dialog = shownCode && <RecoveryCodeDialog code={shownCode} onClose={() => setShownCode(null)} />;
  const errorLine = error && <p className="top-error" role="alert">{error}</p>;

  // 回復コードの画面は、登録の前後で作り直されないよう、どちらの場合も section の次の同じ位置に置く
  if (account.kind === 'registered') {
    return (
      <>
      <section className="top-section" aria-labelledby="top-account-title">
        <h2 id="top-account-title" className="top-section-title">アカウント</h2>
        <p className="top-line">
          <span className="top-strong">{account.name}</span> でログインしています
        </p>
        {status && (
          <p className={status.hasCode ? 'top-hint' : 'top-warn'}>
            {status.hasCode
              ? `回復コード：作成済み${status.createdAt ? `（${formatDateJa(status.createdAt)}）` : ''}`
              : '回復コードがありません。作っておくと、ユーザー名やパスワードを忘れても戻せます'}
          </p>
        )}
        {mode === 'code' ? (
          <form className="top-form" onSubmit={createCode} noValidate>
            <input type="text" name="username" autoComplete="username" value={account.name} readOnly hidden />
            <label className="top-field">
              <span>確認のため、パスワードを入れてください</span>
              <input type="password" name="password" autoComplete="current-password" maxLength={PASSWORD_MAX} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            </label>
            {status?.hasCode && <p className="top-hint">作り直すと、前の回復コードは使えなくなります。</p>}
            {errorLine}
            <div className="top-row">
              <button type="submit" className="top-button top-button-small" disabled={busy}>
                {busy ? '作っています…' : status?.hasCode ? '作り直す' : '作る'}
              </button>
              <button type="button" className="top-button top-button-small top-button-quiet" onClick={() => switchMode('closed')} disabled={busy}>
                やめる
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="top-row">
              {status && (
                <button type="button" className="top-button top-button-small" onClick={() => switchMode('code')} disabled={busy}>
                  {status.hasCode ? '回復コードを作り直す' : '回復コードを作る'}
                </button>
              )}
              <button type="button" className="top-button top-button-small top-button-quiet" onClick={logout} disabled={busy}>
                ログアウト
              </button>
            </div>
            {errorLine}
          </>
        )}
        <PasskeySection username={account.name} />
      </section>
      {dialog}
      </>
    );
  }

  return (
    <>
    <section ref={sectionRef} className="top-section" aria-labelledby="top-account-title">
      <h2 id="top-account-title" className="top-section-title">アカウント</h2>
      <p className="top-line top-muted">登録しなくても遊べます。登録すると、ほかの端末でも続きから遊べます。</p>
      {notice && <p className="top-line" role="status">{notice}</p>}
      {mode === 'closed' && (
        <div className="top-row">
          <button type="button" className="top-button top-button-small" onClick={() => switchMode('register')}>
            登録する
          </button>
          <button type="button" className="top-button top-button-small" onClick={() => switchMode('login')}>
            ログイン
          </button>
        </div>
      )}
      {(mode === 'register' || mode === 'login') && (
        <form className="top-form" onSubmit={submitCredentials} noValidate>
          <div className="top-tabs" role="group" aria-label="登録かログイン">
            <button type="button" className={`top-tab${mode === 'register' ? ' is-selected' : ''}`} aria-pressed={mode === 'register'} onClick={() => switchMode('register')}>
              登録する
            </button>
            <button type="button" className={`top-tab${mode === 'login' ? ' is-selected' : ''}`} aria-pressed={mode === 'login'} onClick={() => switchMode('login')}>
              ログイン
            </button>
          </div>
          {mode === 'login' && passkeySupported() && (
            <div className="top-row">
              <button type="button" className="top-button top-button-small" onClick={passkeyLogin} disabled={busy}>
                パスキーでログイン
              </button>
              <span className="top-hint top-row-note">ユーザー名もパスワードも要りません</span>
            </div>
          )}
          <label className="top-field">
            <span>ユーザー名</span>
            <input
              type="text"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={USERNAME_MAX}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus={!username}
            />
          </label>
          <label className="top-field">
            <span>パスワード</span>
            <input
              type="password"
              name="password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              maxLength={PASSWORD_MAX}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus={!!username}
            />
          </label>
          {mode === 'register' && (
            <p className="top-hint">
              ユーザー名は英数字と _ の {USERNAME_MIN}〜{USERNAME_MAX} 文字、パスワードは {PASSWORD_MIN} 文字以上。メールアドレスは集めません。登録のあとに出る回復コードで、忘れたときに戻せます。
            </p>
          )}
          {errorLine}
          <div className="top-row">
            <button type="submit" className="top-button top-button-small" disabled={busy}>
              {busy ? '送っています…' : mode === 'register' ? '登録する' : 'ログインする'}
            </button>
            <button type="button" className="top-button top-button-small top-button-quiet" onClick={() => switchMode('closed')} disabled={busy}>
              やめる
            </button>
          </div>
          {mode === 'login' && (
            <button type="button" className="top-link" onClick={() => switchMode('recover')}>
              ユーザー名やパスワードを忘れたとき
            </button>
          )}
        </form>
      )}
      {mode === 'recover' && found === null && (
        <form className="top-form" onSubmit={lookupCode} noValidate>
          <label className="top-field">
            <span>回復コード</span>
            <input
              type="text"
              name="recovery-code"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
          </label>
          <p className="top-hint">登録したときに保存したコードです。回復コードも無いと、戻す方法はありません。</p>
          {errorLine}
          <div className="top-row">
            <button type="submit" className="top-button top-button-small" disabled={busy}>
              {busy ? '確かめています…' : '確かめる'}
            </button>
            <button type="button" className="top-button top-button-small top-button-quiet" onClick={() => switchMode('login')} disabled={busy}>
              戻る
            </button>
          </div>
        </form>
      )}
      {mode === 'recover' && found !== null && (
        <form className="top-form" onSubmit={resetPassword} noValidate>
          <p className="top-line">
            ユーザー名は <span className="top-strong">{found}</span> です。
          </p>
          <div className="top-row">
            <button
              type="button"
              className="top-button top-button-small"
              onClick={() => {
                // switchMode が最後に使った名前を入れることがあるので、あとから入れる
                switchMode('login');
                setUsername(found);
              }}
              disabled={busy}
            >
              このユーザー名でログインする
            </button>
          </div>
          <input type="text" name="username" autoComplete="username" value={found} readOnly hidden />
          <label className="top-field">
            <span>パスワードも忘れたときは、新しいパスワード</span>
            <input type="password" name="new-password" autoComplete="new-password" maxLength={PASSWORD_MAX} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <p className="top-hint">決め直すと、ほかの端末のログインが切れます。使った回復コードは無効になり、新しいコードが出ます。</p>
          {errorLine}
          <div className="top-row">
            <button type="submit" className="top-button top-button-small" disabled={busy}>
              {busy ? '決め直しています…' : 'パスワードを決め直す'}
            </button>
            <button type="button" className="top-button top-button-small top-button-quiet" onClick={() => switchMode('closed')} disabled={busy}>
              やめる
            </button>
          </div>
        </form>
      )}
    </section>
    {dialog}
    </>
  );
}
