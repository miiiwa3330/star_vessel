import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AccountError, loginAccount, loginWithPasskey, logoutAccount, passkeySupported, registerAccount, type Account } from '../net/auth';
import { recoveryApi, type RecoveryStatus } from '../net/recovery';
import { credentialProblem, passwordProblem, usernameProblem, PASSWORD_MAX, PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from '../world/account';
import { normalizeRecoveryCode } from '../world/recovery-code';
import { formatDateSlash } from './format-date';
import { lastUsername, rememberUsername } from './last-username';
import { PasskeySection } from './PasskeySection';
import { RecoveryCodeDialog } from './RecoveryCodeDialog';

/** closed：閉じている、register・login：入力、recover：回復コードで戻す、code：登録したあとに回復コードを作る・作り直す */
type Mode = 'closed' | 'register' | 'login' | 'recover' | 'code';

/** 開いたときに、最初から開いておく入力（タイトル画面の SIGN IN・SIGN UP から来たとき） */
export type AccountMode = 'login' | 'register';

/**
 * 入力しながらの、決まりに合っているかの印（2026-11-06 にオーナーの指示）：合っていれば緑の「OK」、合っていなければ赤の「NG」。
 * 空のときは、何も出さない（まだ入れていないだけなので、赤くしない）。problem は、合っていないときの理由（なければ null）
 */
function FieldMark({ value, problem }: { value: string; problem: string | null }) {
  if (value === '') return null;
  return problem === null ? (
    <span className="top-mark is-ok" aria-label="決まりに合っています">OK</span>
  ) : (
    <span className="top-mark is-ng" title={problem} aria-label={`NG：${problem}`}>NG</span>
  );
}

const GENERIC = 'うまくいきませんでした。しばらくしてからもう一度お試しください';
const messageOf = (e: unknown): string => (e instanceof AccountError ? e.message : GENERIC);

/**
 * アカウント（要件 F14・F49・F51）。タイトル画面の SIGN IN・SIGN UP で、月の画面に出る箱（AuthBox）の中身。登録しなくても遊べる。サインアップ（宇宙船名とパスワード）すると、
 * ほかの端末でも続きから遊べ、いまの記録（宇宙船・ワープホール・訪れた天体）も引き継がれる。
 * メールアドレスは集めないので、忘れたときに戻す手段は、登録のあとに 1 回だけ見せる回復コード。
 */
export function AccountPanel({
  account,
  onChanged,
  initialMode,
  onComplete,
  onCancel,
}: {
  account: Account;
  onChanged: () => void;
  initialMode?: AccountMode;
  /** ログイン・登録が終わったとき（登録とパスワードの決め直しは、回復コードを保存して閉じたあと）。呼ぶと、箱が閉じる */
  onComplete?: () => void;
  /** サインアップ・サインインの入力で「Cancel」を押したとき。無ければ、サインアップとサインインの選び直しに戻る */
  onCancel?: () => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode ?? 'closed');
  const [username, setUsername] = useState(() => (initialMode === 'login' ? lastUsername() : ''));
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** 回復：入力中のコードと、コードで分かったユーザー名 */
  const [code, setCode] = useState('');
  const [found, setFound] = useState<string | null>(null);
  /** いま見せている回復コード（1 回だけ） */
  const [shownCode, setShownCode] = useState<string | null>(null);
  /** 回復コードの画面を閉じたら、終わりにする（登録・パスワードの決め直しのとき） */
  const completeAfterCode = useRef(false);
  const [status, setStatus] = useState<RecoveryStatus | null>(null);

  const userId = account.kind === 'registered' ? account.userId : null;
  const registeredName = account.kind === 'registered' ? account.name : null;
  // パスキーでサインインしたときも含めて、この端末で最後に使った名前を覚える
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
        // コードが作れなかったときは、終わりにせず、登録したあとの画面（「回復コードがありません」）を見せる
        await recoveryApi.create(password).then(
          (c) => {
            completeAfterCode.current = true;
            setShownCode(c);
          },
          (err: unknown) => console.error(err),
        );
      } else {
        await loginAccount(username, password);
      }
      switchMode('closed');
      setUsername('');
      onChanged();
      if (mode === 'login') onComplete?.();
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
        completeAfterCode.current = true;
        onChanged();
      } catch {
        setNotice('パスワードを決め直しました。新しいパスワードでサインインしてください');
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

  const passkeyLogin = () => {
    // パスキーでも、宇宙船名は入れてもらう（2026-11-06 にオーナーの指示）
    if (!username.trim()) return setError('宇宙船名を入れてください');
    void run(async () => {
      let ok: boolean;
      try {
        ok = await loginWithPasskey(username);
      } catch (e) {
        onChanged(); // 違う宇宙船名でサインアウトしたので、表示を合わせる
        throw e;
      }
      if (!ok) return;
      switchMode('closed');
      setUsername('');
      onChanged();
      onComplete?.();
    });
  };

  const logout = () =>
    void run(async () => {
      await logoutAccount();
      switchMode('closed');
      onChanged();
      // サインアウトしたら、箱を閉じて、地球へ戻る（右上は SIGN IN・SIGN UP に戻る）
      onComplete?.();
    });

  const closeCodeDialog = () => {
    setShownCode(null);
    if (completeAfterCode.current) {
      completeAfterCode.current = false;
      onComplete?.();
    }
  };
  const dialog = shownCode && <RecoveryCodeDialog code={shownCode} onClose={closeCodeDialog} />;
  const errorLine = error && <p className="top-error" role="alert">{error}</p>;

  // 回復コードの画面は、登録の前後で作り直されないよう、どちらの場合も section の次の同じ位置に置く
  if (account.kind === 'registered') {
    return (
      <>
      <section className="top-section" aria-label="アカウント">
        <p className="top-eyebrow">ACCOUNT</p>
        <p className="top-code-label">{'{宇宙船名}'}</p>
        <p className="top-user-name">{account.name}</p>
        {status && (
          <>
            {/* 回復コード・作った日・作り直すボタンを、縦に一列に並べる（2026-11-06 にオーナーの指示。最初は横の一列だった）。ボタンは、「宇宙船名やパスワードを忘れたとき」と同じ、下線の文字 */}
            <div className="top-code-row">
              <span className="top-code-label">{'{回復コード}'}</span>
              <span className={status.hasCode ? 'top-code-status' : 'top-code-status is-none'}>
                {status.hasCode ? `Created${status.createdAt ? ` [${formatDateSlash(status.createdAt)}]` : ''}` : 'Not created'}
              </span>
              {mode !== 'code' && (
                <button type="button" className="top-link" onClick={() => switchMode('code')} disabled={busy}>
                  {status.hasCode ? 'Re:Creat' : 'Create'}
                </button>
              )}
            </div>
            {!status.hasCode && <p className="top-warn">回復コードがありません。作っておくと、宇宙船名やパスワードを忘れても戻せます</p>}
          </>
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
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            {errorLine}
          </>
        )}
        {mode !== 'code' && <PasskeySection username={account.name} />}
        {mode !== 'code' && (
          <div className="top-signout">
            <button type="button" className="top-button" onClick={logout} disabled={busy}>
              SIGN OUT
            </button>
          </div>
        )}
      </section>
      {dialog}
      </>
    );
  }

  return (
    <>
    <section className="top-section" aria-label="サインアップ・サインイン">
      <p className="top-eyebrow">ACCOUNT</p>
      {notice && <p className="top-line" role="status">{notice}</p>}
      {mode === 'closed' && (
        <div className="top-row">
          <button type="button" className="top-button" onClick={() => switchMode('register')}>
            SIGN UP
          </button>
          <button type="button" className="top-button" onClick={() => switchMode('login')}>
            SIGN IN
          </button>
        </div>
      )}
      {(mode === 'register' || mode === 'login') && (
        <form className="top-form" onSubmit={submitCredentials} noValidate>
          <div className="top-tabs" role="group" aria-label="サインアップかサインイン">
            <button type="button" className={`top-tab${mode === 'register' ? ' is-selected' : ''}`} aria-pressed={mode === 'register'} onClick={() => switchMode('register')}>
              SIGN UP
            </button>
            <button type="button" className={`top-tab${mode === 'login' ? ' is-selected' : ''}`} aria-pressed={mode === 'login'} onClick={() => switchMode('login')}>
              SIGN IN
            </button>
          </div>
          <label className="top-field">
            <span className="top-field-head">宇宙船名<FieldMark value={username} problem={usernameProblem(username)} /></span>
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
            <span className="top-field-head">パスワード<FieldMark value={password} problem={passwordProblem(password)} /></span>
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
              宇宙船名は英数字と _ の {USERNAME_MIN}〜{USERNAME_MAX} 文字、パスワードは {PASSWORD_MIN} 文字以上。メールアドレスは集めません。サインアップのあとに出る回復コードで、忘れたときに戻せます。
            </p>
          )}
          {errorLine}
          <div className="top-row">
            <button type="submit" className="top-button top-button-small" disabled={busy}>
              {busy ? '送っています…' : 'OK'}
            </button>
            <button type="button" className="top-button top-button-small top-button-quiet" onClick={() => (onCancel ? onCancel() : switchMode('closed'))} disabled={busy}>
              Cancel
            </button>
          </div>
          {mode === 'login' && passkeySupported() && (
            <button type="button" className="top-link" onClick={passkeyLogin} disabled={busy}>
              パスキーでサインイン
            </button>
          )}
          {mode === 'login' && (
            <button type="button" className="top-link" onClick={() => switchMode('recover')}>
              宇宙船名やパスワードを忘れたとき
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
          <p className="top-hint">サインアップしたときに保存したコードです。回復コードも無いと、戻す方法はありません。</p>
          {errorLine}
          <div className="top-row">
            <button type="submit" className="top-button top-button-small" disabled={busy}>
              {busy ? '確かめています…' : 'OK'}
            </button>
            <button type="button" className="top-button top-button-small top-button-quiet" onClick={() => switchMode('login')} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {mode === 'recover' && found !== null && (
        <form className="top-form" onSubmit={resetPassword} noValidate>
          <p className="top-line">
            宇宙船名は <span className="top-strong">{found}</span> です。
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
              この宇宙船名でサインインする
            </button>
          </div>
          <input type="text" name="username" autoComplete="username" value={found} readOnly hidden />
          <label className="top-field">
            <span className="top-field-head">パスワードも忘れたときは、新しいパスワード<FieldMark value={password} problem={passwordProblem(password)} /></span>
            <input type="password" name="new-password" autoComplete="new-password" maxLength={PASSWORD_MAX} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <p className="top-hint">決め直すと、ほかの端末のサインインが切れます。使った回復コードは無効になり、新しいコードが出ます。</p>
          {errorLine}
          <div className="top-row">
            <button type="submit" className="top-button top-button-small" disabled={busy}>
              {busy ? '決め直しています…' : 'パスワードを決め直す'}
            </button>
            <button type="button" className="top-button top-button-small top-button-quiet" onClick={() => switchMode('closed')} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
    {dialog}
    </>
  );
}
