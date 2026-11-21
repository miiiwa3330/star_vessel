---
summary: 本番公開に向けたセキュリティ強化（PBKDF2・Origin 検証・Rate Limiting・CSP・XSS 修正・接続上限）とパフォーマンス最適化（2K WebP・遅延読み込み・Range 取得・フォント削減・起動並列化）の方針と計測結果
---
# セキュリティ強化とパフォーマンス最適化（本番公開前）

2026-11-22、`star-vessel.miiiwa.com` の本番公開を見据えて実施したセキュリティ対策と転送量・CPU・メモリ最適化の記録（ブランチ `feature/security-and-performance`）。実装・設定の正本は [`../../tech/server.md`](../../tech/server.md)、[`../../design/README.md`](../../design/README.md)、[`../../tech/world-model.md`](../../tech/world-model.md)。

## セキュリティ強化で選んだこと

### 1. パスワードハッシュを `scrypt` から Web Crypto PBKDF2 へ変更
- **背景**：Better Auth 既定の `scrypt`（`N=16384, r=16` で 1 回あたり約 33.5 MB のメモリと長い CPU 時間を消費）を Cloudflare Workers の無料プラン（CPU 10 ms／メモリ 128 MB）で動かすと、Error 1102 でログインや登録が失敗する恐れがあった
- **選択**（`src/world/password.ts`・`worker/auth-options.ts`）：新規登録・パスワード変更は Web Crypto API（`crypto.subtle.deriveBits`）の `PBKDF2-HMAC-SHA-256`、反復回数は Workers 本番の上限に合わせた `100,000` 回（`PBKDF2_ITERATIONS = 100_000`）をネイティブ実行し、NFKC 正規化とタイミング差を抑えた比較（`constantTimeEqual`）を組み合わせた。検証時（`verifyPasswordHash`）は `pbkdf2:` 形式以外を Better Auth の旧 `scrypt` 検証（`verifyLegacyScrypt`）へフォールバックし、既存アカウントとの互換性を保った
- **確かめたこと**：手元の D1（`account` 表）に `pbkdf2:100000:<saltHex>:<keyHex>`（長さ 111 文字）で保存され、サインアップ → ログアウト → サインイン → 回復コードでの再設定 → 新パスワードでのサインインが通ること

### 2. CSRF / CSWSH 対策と入力・接続の制限
- **送信元 `Origin` 検証**（`worker/index.ts`・`src/world/http-security.ts`）：`/api/auth/*`（Better Auth が独自に検証）以外の状態変更リクエスト（`POST`・`PUT`・`DELETE` 等）および `/api/space/:system` の WebSocket 接続について、`isOriginAllowedForRequest` で `Origin` を `BETTER_AUTH_URL` と照合し、不一致や欠落は `403 forbidden_origin` で拒否するようにした（`localhost` 開発時のみ他ポートの `http://localhost:*` を許可）
- **Workers Rate Limiting バインディング**（`wrangler.jsonc`・`worker/index.ts`）：`ANON_LIMITER`（10 回/60 秒）・`AUTH_LIMITER`（20 回/60 秒）・`API_WRITE_LIMITER`（60 回/60 秒）を追加。Wrangler は `env.production` にトップレベルの `ratelimits` を引き継がないため、トップレベルと `env.production` の両方に定義した。超過時は `429 rate_limited` と `Retry-After: 60` を返す
  - 無料プランの 1 日 10 万リクエスト上限を守るため、エッジ側の WAF Rate Limiting ルール（無料枠 1 ルール）と Turnstile は本番公開前にダッシュボードで設定する方針とし、[`../../tech/server.md`](../../tech/server.md) の「本番で残っていること」に残した
- **HTTP ヘッダ・キャッシュ整理**（`public/_headers`・`src/world/http-security.ts`）：静的配信に `Content-Security-Policy`（WebGPU/WebGL2 の WASM 実行と `SurfacePainter` 用 Web Worker のため `'wasm-unsafe-eval'` と `worker-src 'self' blob:` を許可）、`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy`、`Permissions-Policy` を設定。認証付き API（`/api/warps`・`/api/ship`・`/api/visits`）には `Cache-Control: private, no-store` を付けた
  - **実装時の注意点**：Cloudflare Workers の `caches.default.match()` が返す `Response` はヘッダが不変（immutable）なため、`/api/*` ミドルウェアでは `c.res.headers.set` が例外を投げた場合に `new Response(c.res.body, ...)` で複製してセキュリティヘッダを付与し、`101` WebSocket 応答は除外した
- **ボディ上限・件数上限・誤リンク防止**：
  - `readJsonWithLimit` で `Content-Length` と実ストリームの両方を検証（ワープ・訪問・回復コードは `4 KB`、シップ設計は `256 KB`、超過は `413`）
  - `/api/warps` 一覧は `ORDER BY created_at DESC LIMIT 1000` に変更し、古い匿名スパムで新しいワープが追い出されないようにした。`/api/visits` は `MAX_VISITS_PER_PLAYER = 35,000` を上限にした
  - パスキーログイン時の `x-passkey-username` 照合（`worker/auth.ts`・`src/net/auth.ts`）を追加し、入力した宇宙船名と異なるパスキーが選ばれた場合は `onLinkAccount` でセッションを削除して `403 PASSKEY_USERNAME_MISMATCH` を返すようにした
- **ローディング画面の DOM XSS 修正**（`src/loading-screen.ts`・`src/loading-timing.ts`）：`localStorage` 由来の `rememberedUfoLook().url` を `innerHTML` へ直接埋め込む実装をやめ、`isSafeUfoImageUrl`（`data:image/(png|webp|jpeg);base64,...` のみ許可）で検証したうえで `document.createElement('img')` により組み立てるように変更した
- **宇宙の部屋（`SpaceRoom`）の接続上限と復旧**（`worker/space-room.ts`）：`MAX_CONNECTIONS_PER_ROOM = 200`・`MAX_CONNECTIONS_PER_USER = 4`（不可逆ハッシュ `uidHash` を内部の `Attachment` のみに保持してカウント）を追加し、`webSocketError` でも人数を更新してソケットを閉じるようにした

## パフォーマンス最適化と計測結果

| 対象 | やったこと | 結果（計測・確認） |
|------|------------|--------------------|
| 惑星 2K テクスチャ | 11 枚すべてを WebP（`cwebp -q 85`）へ変換（`public/textures/*.webp`）し、`INITIAL_TEXTURES`（地球 3 枚＋月）だけを起動時に読み込み、水星〜海王星 7 枚は近づいたとき（`px > 0.5`）に遅延読み込み（`SolarSystemView`） | WebP 合計 `2.4 MB`（初期 4 枚 `1,428 KB`、遅延 7 枚 `1,016 KB`）。起動時に水星〜海王星を読まず、火星・土星へ瞬間移動したタイミングで遅延取得されることを Chrome で確認 |
| 起動通信の並列化 | `src/main.ts` で静的データ取得と `sessionTask`（`ensureSession` → `warpApi.list()`・`shipApi.get()`）を 1 つの `Promise.all` にまとめた | 認証待ちによる直列ウォーターフォールを解消。`/api/satellites` も 4 秒タイムアウト（`worker/satellites.ts`）付きの非ブロッキング読み込みとした |
| モバイル Gaia 星データ | `(pointer: coarse)` 端末は先頭 `GAIA_MOBILE_STARS`（100,000 星）のバイト範囲だけ `Range: bytes=0-2399999` で部分取得 | 390×844 モバイル検証で `206 Partial Content`・`Content-Length: 2400000` を実測 |
| DotGothic16 フォント | `src/ui/Hud.tsx` の読み込みを `@fontsource/dotgothic16/latin-400.css` に絞り、開閉ボタンを全角 `＊` から ASCII `*` へ統一（左上の状態表示も英語化済み） | ビルド出力のフォントは `latin-400` の `woff2`（`10 KB`）・`woff`（`15 KB`）の 2 ファイルのみ、CSS チャンクは `234 B` |
| シップ設計の並び正規化 | `canonicalizeShipDesign`（`src/world/ship-design.ts`）で検証と正規化を 1 本化し、約 `2 MB` の `Int32Array(GRID^3)` を 1 回だけ確保して使い回す | `PUT /api/ship` での二重デコードと配列再確保を削減 |
| エッジキャッシュ | `worker/presence.ts`（15 秒）と `worker/ships.ts` の `GET /api/ship/blocks/:ref`（200 は 1 年 `immutable`・404 は 60 秒負キャッシュ、`PUT /api/ship` 時に削除）に `caches.default` を導入 | D1 への重複クエリをエッジで吸収。404 応答の `cache-control: public, max-age=60` を確認 |
| 計算・毎フレーム処理 | `nearestSystem()`（`src/world/address.ts`）に `WeakMap` 距離キャッシュと三角不等式による太陽近傍高速パス、`SpaceRoom.broadcast()` に `anchorCache` と `indexBySid` Map、`src/main.ts` にフレーム用ベクトルの再利用を追加 | 恒星走査・ルーム配信（`O(N)` 索引）・毎フレーム GC を削減 |

- **遅延読み込みの落とし穴と修正**：`SolarSystemView.updatePoints()` では遠く／近すぎる点をスキップする `if (px > POINT_MAX_PX)` や `if (n >= MAX_POINTS)` の判定があり、その後に `startDeferredTexture` を置くとワープや瞬間移動で惑星へ直接近づいたときに画像が読み込まれない。`updatePoints()` の両ガードより前に `DEFERRED_TEXTURE_PX` 判定を置き、取得失敗時は `SurfacePainter` の自動描画へフォールバックさせた

## 確かめ方

- **自動テスト・型・ビルド**：`npm test`、`npm run check`、`npm run build`、`npm run auth:schema` が通ることを確認
- **ローカル本番相当環境（Chrome WebGPU / WebGL2 / モバイル 390×844、独立ポート 5174）**：
  - `pageErrors: []` でサインアップ → 回復コード発行 → ログアウト → 不正パスワード 401 → 再ログイン → 回復コードでパスワード再設定 → 再ログインを確認
  - 不正 `Origin`・`Origin` 欠落の POST / WebSocket が `403` で拒否、過大 JSON が `413`、同一アカウントの WebSocket 同時接続 5 本目が拒否（`["open","open","open","open","error"]`）、ローディング画面の `onerror` 文字列注入で `window.__xss === 0` かつフォールバック SVG 表示を確認
  - WebGPU・WebGL2 両方の実画面スクリーンショットで、タイトル画面（地球・月）・起動時地球・火星・土星（環・影含む）・モバイル表示の描画と `DotGothic16` の `*` トグル表示に崩れが無いことを確認
