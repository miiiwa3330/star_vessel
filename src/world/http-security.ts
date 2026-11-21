/**
 * Worker の HTTP セキュリティの共通ヘルパー。
 * テストしやすいよう純粋な関数と Fetch API 標準の型だけで書く。
 */

export const API_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

export const PRIVATE_NO_STORE = 'private, no-store';

/** `origin` が許可された送信元か（`localhost` 開発時は他ポートの localhost も許す） */
export function isAllowedOrigin(origin: string | null, baseUrl: string): boolean {
  if (!origin) return false;
  let expected: URL;
  try {
    expected = new URL(baseUrl);
  } catch {
    return false;
  }
  if (origin === expected.origin) return true;
  return expected.hostname === 'localhost' && /^http:\/\/localhost(?::\d+)?$/.test(origin);
}

/** 状態を変えるリクエストと WebSocket 接続について、送信元オリジンを確かめる */
export function isOriginAllowedForRequest(method: string, origin: string | null, upgrade: string | null, baseUrl: string): boolean {
  const isWs = upgrade?.toLowerCase() === 'websocket';
  const safeMethod = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
  if (!isWs && safeMethod) return true;
  return isAllowedOrigin(origin, baseUrl);
}

/** Cloudflare Workers の接続元 IP（ローカル開発では `'local'`） */
export const clientIpKey = (request: Request): string => request.headers.get('cf-connecting-ip') || 'local';

export type JsonReadResult = { ok: true; data: unknown } | { ok: false; reason: 'too_large' | 'invalid' };

/**
 * バイト数上限を守りながら JSON ボディを読む。
 * `Content-Length` だけでなくストリームの実バイト数も数えるため、チャンク転送での過大入力も防げる
 */
export async function readJsonWithLimit(request: Request, maxBytes: number): Promise<JsonReadResult> {
  const lenHeader = request.headers.get('content-length');
  if (lenHeader !== null) {
    const declared = Number(lenHeader);
    if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: 'too_large' };
  }
  const body = request.body;
  if (!body) return { ok: false, reason: 'invalid' };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return { ok: true, data: JSON.parse(new TextDecoder().decode(buf)) };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}
