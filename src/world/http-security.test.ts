import { describe, expect, it } from 'vitest';
import { isAllowedOrigin, isOriginAllowedForRequest, readJsonWithLimit } from './http-security';

describe('Origin の検証', () => {
  it('本番は一致するオリジンのみ許可し、欠落や別サブドメインを拒否する', () => {
    const base = 'https://star-vessel.miiiwa.com';
    expect(isAllowedOrigin('https://star-vessel.miiiwa.com', base)).toBe(true);
    expect(isAllowedOrigin('https://evil.miiiwa.com', base)).toBe(false);
    expect(isAllowedOrigin('http://star-vessel.miiiwa.com', base)).toBe(false);
    expect(isAllowedOrigin('null', base)).toBe(false);
    expect(isAllowedOrigin(null, base)).toBe(false);
  });

  it('開発（localhost）ではポート違いの localhost を許可し、外部オリジンを拒否する', () => {
    const base = 'http://localhost:5173';
    expect(isAllowedOrigin('http://localhost:5173', base)).toBe(true);
    expect(isAllowedOrigin('http://localhost:5174', base)).toBe(true);
    expect(isAllowedOrigin('https://localhost:5173', base)).toBe(false);
    expect(isAllowedOrigin('http://evil.example', base)).toBe(false);
  });

  it('状態変更メソッドと WebSocket Upgrade のみ Origin を必須とする', () => {
    const base = 'https://star-vessel.miiiwa.com';
    expect(isOriginAllowedForRequest('GET', null, null, base)).toBe(true);
    expect(isOriginAllowedForRequest('POST', null, null, base)).toBe(false);
    expect(isOriginAllowedForRequest('POST', base, null, base)).toBe(true);
    expect(isOriginAllowedForRequest('DELETE', 'https://other.example', null, base)).toBe(false);
    expect(isOriginAllowedForRequest('GET', null, 'websocket', base)).toBe(false);
    expect(isOriginAllowedForRequest('GET', base, 'websocket', base)).toBe(true);
  });
});

describe('readJsonWithLimit', () => {
  it('上限以内の JSON を読み取る', async () => {
    const req = new Request('https://example.com', { method: 'POST', body: JSON.stringify({ ok: 1 }) });
    expect(await readJsonWithLimit(req, 64)).toEqual({ ok: true, data: { ok: 1 } });
  });

  it('Content-Length ヘッダが上限を超えると即拒否する', async () => {
    const req = new Request('https://example.com', {
      method: 'POST',
      headers: { 'content-length': '5000' },
      body: '{}',
    });
    expect(await readJsonWithLimit(req, 64)).toEqual({ ok: false, reason: 'too_large' });
  });

  it('実ボディが上限を超えるストリームを途中で止めて拒否する', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"a":"' + 'x'.repeat(80) + '"}'));
        c.close();
      },
    });
    const req = new Request('https://example.com', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    expect(await readJsonWithLimit(req, 64)).toEqual({ ok: false, reason: 'too_large' });
  });

  it('不正な JSON は invalid を返す', async () => {
    const req = new Request('https://example.com', { method: 'POST', body: '{bad' });
    expect(await readJsonWithLimit(req, 64)).toEqual({ ok: false, reason: 'invalid' });
  });
});
