/**
 * いまログインしている、登録したアカウントのユーザー名（タイトル画面の右上に出す）。要件 F55。
 * Better Auth のクライアントを読み込まず、サーバーに 1 回だけ問い合わせる（タイトル画面を軽く開くため）。
 * 匿名のアカウント・ログインしていない・読めない、のときは null。匿名のアカウントは、ここでは作らない
 */
export async function fetchSignedInName(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/get-session', { credentials: 'same-origin' });
    if (!res.ok) return null;
    const body = (await res.json()) as { user?: { isAnonymous?: boolean | null; displayUsername?: string | null; username?: string | null; name?: string } } | null;
    const u = body?.user;
    if (!u || u.isAnonymous) return null;
    return u.displayUsername ?? u.username ?? u.name ?? null;
  } catch {
    return null;
  }
}
