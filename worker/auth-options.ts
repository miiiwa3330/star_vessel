/**
 * アカウントの設定（Better Auth）。要件 F14：登録なしで始め、記録を残したい人だけ後から登録する。
 *
 * サーバー（worker/auth.ts）と、テーブルの SQL を作る道具（tools/gen-auth-schema.ts）の両方が使う。
 * プラグインを足したら `npm run auth:schema` で SQL を作り直し、migrations/ に新しいファイルとして足す。
 */
import type { BetterAuthOptions } from 'better-auth';
import { anonymous } from 'better-auth/plugins';

export const authOptions = {
  basePath: '/api/auth',
  // 後から登録したときに、匿名のときのワープホールを引き継ぐ処理（onLinkAccount）は、登録を作るときに足す
  plugins: [anonymous()],
} satisfies BetterAuthOptions;
