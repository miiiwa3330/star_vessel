/**
 * アカウントの登録・ログインで使う、ユーザー名とパスワードの決まり（要件 F49）。
 * サーバー（worker/）とブラウザの両方で使う。DOM・three.js・astronomy-engine を読み込まない。
 *
 * - ユーザー名：英数字とアンダースコアだけ、3〜20 文字。大文字と小文字は区別しない（保存は小文字、表示は入力のまま）
 * - パスワード：8〜64 文字
 * - メールアドレスは集めない。Better Auth はアカウントごとにメールを必須とするので、内部では仮のアドレス
 *   （ユーザー名＋予約済みの .invalid ドメイン）を使う。どこにも送らず、画面にも出さない（docs/tech/server.md）
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;

/** 内部のメールアドレスのドメイン。.invalid は実在しないと決められているので、間違って送られることがない */
export const INTERNAL_EMAIL_DOMAIN = 'users.star-vessel.invalid';

const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;

export const isUsername = (v: unknown): v is string =>
  typeof v === 'string' && v.length >= USERNAME_MIN && v.length <= USERNAME_MAX && USERNAME_PATTERN.test(v);

export const isPassword = (v: unknown): v is string => typeof v === 'string' && v.length >= PASSWORD_MIN && v.length <= PASSWORD_MAX;

/** ユーザー名から、内部のメールアドレスを作る（大文字小文字を区別しないので小文字にする） */
export const internalEmailFor = (username: string): string => `${username.toLowerCase()}@${INTERNAL_EMAIL_DOMAIN}`;

/** 内部のメールアドレスか（画面に出さないために見分ける） */
export const isInternalEmail = (email: string): boolean => email.endsWith(`@${INTERNAL_EMAIL_DOMAIN}`);

/** 宇宙船名（ユーザー名）が決まりに合っているか。合っていなければ、画面に出す理由（日本語）。入力しながらの OK・NG にも使う */
export function usernameProblem(username: string): string | null {
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return `宇宙船名は ${USERNAME_MIN}〜${USERNAME_MAX} 文字にしてください`;
  }
  if (!USERNAME_PATTERN.test(username)) return '宇宙船名に使えるのは、英数字とアンダースコア（_）だけです';
  return null;
}

/** 入力が決まりに合っているか。合っていなければ、画面に出す理由（日本語）。登録のときに使う */
export function credentialProblem(username: string, password: string): string | null {
  return usernameProblem(username) ?? passwordProblem(password);
}

/** パスワードが決まりに合っているか。合っていなければ、画面に出す理由（日本語） */
export function passwordProblem(password: string): string | null {
  return isPassword(password) ? null : `パスワードは ${PASSWORD_MIN}〜${PASSWORD_MAX} 文字にしてください`;
}

/**
 * サーバー（Better Auth）が返したエラーを、画面に出す日本語にする。
 * code は Better Auth のエラーの記号、status は HTTP の状態。どちらにも当てはまらないものは、原因を出さずに汎用の文にする
 */
export function accountErrorMessage(code: string | undefined, status?: number): string {
  switch (code) {
    case 'USERNAME_IS_ALREADY_TAKEN':
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'この宇宙船名は、すでに使われています';
    case 'INVALID_USERNAME_OR_PASSWORD':
    case 'INVALID_USERNAME':
      return '宇宙船名かパスワードが違います';
    case 'USERNAME_TOO_SHORT':
    case 'USERNAME_TOO_LONG':
      return `宇宙船名は ${USERNAME_MIN}〜${USERNAME_MAX} 文字にしてください`;
    case 'PASSWORD_TOO_SHORT':
    case 'PASSWORD_TOO_LONG':
      return `パスワードは ${PASSWORD_MIN}〜${PASSWORD_MAX} 文字にしてください`;
    case 'PREVIOUSLY_REGISTERED':
    case 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED':
      return 'この端末のパスキーは、すでに追加してあります';
    case 'SESSION_NOT_FRESH':
      return '安全のため、一度サインアウトして、もう一度サインインしてから追加してください';
    case 'PASSKEY_NOT_FOUND':
    case 'AUTHENTICATION_FAILED':
      return 'このパスキーではサインインできません。消されたパスキーかもしれません';
    default:
      return status === 429 ? '短い間に何度も試されました。しばらくしてからもう一度お試しください' : 'うまくいきませんでした。しばらくしてからもう一度お試しください';
  }
}

/** パスキーの操作を、自分でやめたときの記号。エラーとして出さない */
const PASSKEY_CANCEL_CODES = new Set(['AUTH_CANCELLED', 'REGISTRATION_CANCELLED', 'ERROR_CEREMONY_ABORTED', 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY']);
export const isPasskeyCancel = (code: string | undefined): boolean => code !== undefined && PASSKEY_CANCEL_CODES.has(code);
