import { describe, expect, it } from 'vitest';
import { accountErrorMessage, credentialProblem, usernameProblem, isPasskeyCancel, internalEmailFor, isInternalEmail, isPassword, isUsername, PASSWORD_MAX, USERNAME_MAX } from './account';

describe('ユーザー名とパスワードの決まり', () => {
  it('入力しながらの OK・NG：宇宙船名の決まりに合うときだけ、理由が無い', () => {
    expect(usernameProblem('abc')).toBeNull();
    expect(usernameProblem('Star_Ship_01')).toBeNull();
    expect(usernameProblem('ab')).toContain('宇宙船名');
    expect(usernameProblem('a'.repeat(21))).toContain('宇宙船名');
    expect(usernameProblem('ab cd')).toContain('英数字');
    expect(usernameProblem('宇宙船です')).toContain('英数字');
  });

  it('ユーザー名は英数字とアンダースコアの 3〜20 文字', () => {
    expect(isUsername('abc')).toBe(true);
    expect(isUsername('Star_Vessel_01')).toBe(true);
    expect(isUsername('ab')).toBe(false);
    expect(isUsername('a'.repeat(USERNAME_MAX))).toBe(true);
    expect(isUsername('a'.repeat(USERNAME_MAX + 1))).toBe(false);
  });

  it('ユーザー名に、記号・空白・日本語・メールの形は使えない', () => {
    for (const bad of ['a b c', 'abc!', 'あいう', 'a@b.c', 'abc.def', 'a-b', ' abc', 'abc\n']) expect(isUsername(bad)).toBe(false);
  });

  it('パスワードは 8〜64 文字', () => {
    expect(isPassword('1234567')).toBe(false);
    expect(isPassword('12345678')).toBe(true);
    expect(isPassword('a'.repeat(PASSWORD_MAX))).toBe(true);
    expect(isPassword('a'.repeat(PASSWORD_MAX + 1))).toBe(false);
    expect(isPassword(undefined)).toBe(false);
  });

  it('内部のメールは小文字で、実在しないドメインになり、見分けられる', () => {
    expect(internalEmailFor('Star_01')).toBe('star_01@users.star-vessel.invalid');
    expect(isInternalEmail(internalEmailFor('abc'))).toBe(true);
    expect(isInternalEmail('someone@example.com')).toBe(false);
    // 大文字小文字だけが違う名前は、同じ内部のメールになる（重複して登録できない）
    expect(internalEmailFor('ABC')).toBe(internalEmailFor('abc'));
  });

  it('入力の問題を、画面に出す日本語で返す', () => {
    expect(credentialProblem('abc', 'password1')).toBeNull();
    expect(credentialProblem('ab', 'password1')).toContain('宇宙船名');
    expect(credentialProblem('abc!', 'password1')).toContain('英数字');
    expect(credentialProblem('abc', 'short')).toContain('パスワード');
  });

  it('サーバーのエラーを日本語にする。知らないエラーは汎用の文になり、原因は出さない', () => {
    expect(accountErrorMessage('USERNAME_IS_ALREADY_TAKEN')).toContain('すでに使われて');
    expect(accountErrorMessage('INVALID_USERNAME_OR_PASSWORD')).toContain('違います');
    expect(accountErrorMessage('PASSWORD_TOO_SHORT')).toContain('パスワード');
    expect(accountErrorMessage(undefined, 429)).toContain('何度も');
    expect(accountErrorMessage('SOMETHING_ELSE', 500)).toBe(accountErrorMessage(undefined));
    // ユーザー名が存在しないことと、パスワードが違うことを、見分けられるように出さない
    expect(accountErrorMessage('INVALID_USERNAME')).toBe(accountErrorMessage('INVALID_USERNAME_OR_PASSWORD'));
  });

  it('パスキーのエラーを日本語にする。自分でやめたときはエラーにしない', () => {
    expect(accountErrorMessage('ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED')).toContain('すでに追加');
    expect(accountErrorMessage('SESSION_NOT_FRESH')).toContain('もう一度サインイン');
    expect(accountErrorMessage('PASSKEY_NOT_FOUND')).toContain('サインインできません');
    expect(isPasskeyCancel('AUTH_CANCELLED')).toBe(true);
    expect(isPasskeyCancel('PASSKEY_NOT_FOUND')).toBe(false);
    expect(isPasskeyCancel(undefined)).toBe(false);
  });
});
