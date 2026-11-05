/**
 * アカウントの設定（Better Auth）。要件 F14：登録なしで始め、記録を残したい人だけ後から登録する。
 * 要件 F49：登録はユーザー名＋パスワード（メールは集めない。src/world/account.ts）。
 *
 * サーバー（worker/auth.ts）と、テーブルの SQL を作る道具（tools/gen-auth-schema.ts）の両方が使う。
 * プラグインを足したら `npm run auth:schema` で SQL を作り直し、migrations/ に新しいファイルとして足す。
 */
import type { BetterAuthOptions } from 'better-auth';
import { anonymous, username } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { isUsername, PASSWORD_MAX, PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from '../src/world/account.ts';

type OnLinkAccount = NonNullable<Parameters<typeof anonymous>[0]>['onLinkAccount'];
type PasskeySite = { rpID: string; origin: string[] };

/** 匿名のアカウントから登録（または既存のアカウントへのログイン）をしたときの引き継ぎは onLinkAccount に渡す（DB が要るので worker/auth.ts が作る） */
export const authPlugins = (onLinkAccount?: OnLinkAccount, site?: PasskeySite) => [
  anonymous({ onLinkAccount }),
  // ユーザー名は小文字にそろえて保存する（Better Auth の既定）。表示用に入力のままの名前も残す（displayUsername）
  username({ minUsernameLength: USERNAME_MIN, maxUsernameLength: USERNAME_MAX, usernameValidator: isUsername }),
  // パスキー（要件 F52）。residentKey を必須にして、ユーザー名を入れなくても端末がアカウントを出せるようにする
  passkey({
    rpName: 'STAR VESSEL',
    rpID: site?.rpID,
    origin: site?.origin,
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  }),
];

export const authOptions = {
  basePath: '/api/auth',
  emailAndPassword: { enabled: true, minPasswordLength: PASSWORD_MIN, maxPasswordLength: PASSWORD_MAX, autoSignIn: true },
  plugins: authPlugins(),
} satisfies BetterAuthOptions;
