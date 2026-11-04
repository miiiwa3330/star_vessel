/**
 * ワープホールの保存先（サーバーの /api/warps。worker/warps.ts）。全員で共有される（要件 F9）。
 */
import { isWarpHole, type WarpHole, type WarpPlacement } from '../world/warp-schema';

export type WarpErrorKind = 'limit' | 'unauthorized' | 'invalid' | 'not_found' | 'network' | 'server';

export class WarpApiError extends Error {
  constructor(
    readonly kind: WarpErrorKind,
    message: string,
  ) {
    super(message);
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: 'same-origin', ...init });
  } catch (e) {
    throw new WarpApiError('network', e instanceof Error ? e.message : String(e));
  }
  if (res.ok) return res;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  const kind: WarpErrorKind =
    body.error === 'limit' || body.error === 'unauthorized' || body.error === 'invalid' || body.error === 'not_found'
      ? body.error
      : 'server';
  throw new WarpApiError(kind, `${res.status} ${body.error ?? ''}`);
}

export const warpApi = {
  /** 全員のワープホール */
  async list(): Promise<WarpHole[]> {
    const data = (await (await request('/api/warps')).json()) as unknown;
    return Array.isArray(data) ? data.filter(isWarpHole) : [];
  },

  /** 置く。住所のコードはサーバーが付けて返す。上限を超えると kind: 'limit' */
  async place(placement: WarpPlacement): Promise<WarpHole> {
    const res = await request('/api/warps', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(placement),
    });
    const data = (await res.json()) as unknown;
    if (!isWarpHole(data)) throw new WarpApiError('server', '返ってきた形が正しくない');
    return data;
  },

  /** 消す（置いた本人だけ） */
  async remove(id: string): Promise<void> {
    await request(`/api/warps/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
