/**
 * いま遊んでいる人数（要件 F50。サーバーの /api/presence。worker/presence.ts）。
 * 読めなければ null（タイトル画面は、人数を出さずに続ける）
 */
export async function fetchOnline(): Promise<number | null> {
  try {
    const res = await fetch('/api/presence');
    if (!res.ok) return null;
    const body = (await res.json()) as { online?: unknown };
    return typeof body.online === 'number' && Number.isFinite(body.online) ? body.online : null;
  } catch {
    return null;
  }
}
