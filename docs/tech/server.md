---
summary: サーバー（Cloudflare Workers・D1・Better Auth）の構成、API、データの持ち方、アカウント、手元での動かし方、本番に出す前に残っていること
---
# サーバー

技術の選定理由は [`stack.md`](stack.md) の「サーバー側の選定」。ここには、どう作ってあるかを書く。

## 構成

| 部品 | 役目 | 場所 |
|------|------|------|
| Cloudflare Workers | `/api/` を受ける入口。それ以外は Vite が書き出した静的なファイルを配る（Worker を通らないので料金がかからない） | `worker/index.ts`、`wrangler.jsonc` |
| Hono | `/api/` の中の振り分け | `worker/index.ts` |
| D1（SQLite） | ワープホールとアカウントの保存 | `migrations/` |
| Better Auth | アカウント。いまは匿名だけ | `worker/auth.ts`、`worker/auth-options.ts` |
| Durable Objects | 他のプレイヤーの宇宙船の位置のやりとり（まだ作っていない） | — |

- サーバーとブラウザで同じ決まりを使うコード（宇宙の住所・ワープホールの形の確かめ）は `src/world/address.ts` と `src/world/warp-schema.ts` に置き、両方から読み込む。この 2 つは three.js・DOM・astronomy-engine を読み込まない
- 開発サーバー（`npm run dev`）は、Vite の中で Worker も動かす（`@cloudflare/vite-plugin`）。手元の D1 は `.wrangler/state/` にできる

## API

| メソッド・パス | 中身 | ログイン |
|----------------|------|----------|
| `GET /api/warps` | 全員のワープホール（最大 1,000 個）。自分のものには `mine: true` | 不要 |
| `POST /api/warps` | ワープホールを置く。送るのは置く場所（`WarpPlacement`）。住所の番号はサーバーが振って返す | 必要（匿名でよい） |
| `DELETE /api/warps/:id` | 消す。置いた本人だけ | 必要 |
| `/api/auth/*` | Better Auth（匿名のログイン・セッション） | — |

エラーは `{ "error": "..." }`：`unauthorized`（401）、`invalid`（400・形が正しくない）、`limit`（409・3 個まで）、`not_found`（404・無い、または自分のものではない）。

## ワープホールの保存

テーブルは `migrations/0002_warps.sql`。

- **住所の番号**：`warp_counters` に、住所（番号の前まで。例 `MW-ORI-SOL-3-0`）ごとの最後の番号を持つ。消した番号は使い回さない（住所と同じ）
- **上限と番号を同時に守る**：D1 の `batch`（1 つのトランザクション）の中で、「上限を超えていなければ番号を 1 つ進める」「上限を超えていなければ、その番号で置く」を続けて行う。2026-11-05 に、同じ人が同時に 6 回置こうとして、3 回だけ通り、番号が 001〜003 で欠けないことを確かめた
- **置く場所の確かめ**：サーバーは受け取った置く場所を `isWarpPlacement` で確かめる（天体の名前・数が有限か・正面の向きが単位ベクトルか・太陽系の外の恒星系は太陽を基準にしているときだけ）。住所の番号の前までは、サーバーが天体と恒星系から組み立てる
- **信用していること（いまの制限）**：置く場所が「本当に今いる場所か」と、恒星系の記号（どの星に近いか）は、ブラウザが送ったものを信じている。宇宙船の位置をサーバーが知るようになったら（Durable Objects）、サーバーの知っている位置と照らし合わせる
- **一覧は全員分を返す**：ワープホールが少ないうち（1 人 3 個 × 数百人）だけの作り。増えたら、近いものだけ・ページごとに返す形にする
- **一覧を取り直すのは、一覧を開いたとき**。一定の間隔で取りに行くと、人数が増えたときに Workers の無料の上限（1 日 10 万リクエスト）をすぐ使い切るため

## アカウント

要件 F14。Better Auth の anonymous プラグイン。

- 起動すると、ログインしていなければ自動的に匿名のアカウントを作ってログインする（`src/net/auth.ts`）。セッションはクッキー
- **後から登録する画面は、まだ無い**。作るときは、匿名のときのワープホールを登録したアカウントへ引き継ぐ処理（anonymous プラグインの `onLinkAccount` で `warps.owner_id` を書き換える）を必ず足す。Better Auth は、登録すると匿名のアカウントを消すため。`warps.owner_id` に外部キーの連鎖削除を付けていないのは、引き継ぐ前にワープホールが消えないようにするため
- **テーブルの SQL**：Better Auth のテーブルは手で書かず、`npm run auth:schema` で Better Auth 自身に作らせる（`tools/gen-auth-schema.ts`。Node.js 組み込みの SQLite に対してマイグレーションの SQL を組み立てる）。プラグインを足したら作り直し、差分を新しいマイグレーションのファイルにする

## 手元での動かし方

```bash
cp .dev.vars.example .dev.vars   # BETTER_AUTH_SECRET に openssl rand -base64 32 の値を入れる
npm run db:migrate               # 手元の D1 にテーブルを作る
npm run dev                      # http://localhost:5173 （/api/ も動く）
```

- 新しいパッケージを入れたあとに開発サーバーが `504 (Outdated Optimize Dep)` を返し続けたら、開発サーバーを止めて起動し直す（2026-11-05 に、起動したままパッケージを入れて起きた）
- npm 11 はパッケージのインストール時のスクリプトを止める。esbuild・workerd は、スクリプトを許可しなくても動くことを確かめた（許可はしていない）

## 本番に出す前に残っていること

- 本番の D1 を作り（`npx wrangler d1 create star-vessel`）、`wrangler.jsonc` の `database_id` を置き換え、`npx wrangler d1 migrations apply DB --remote`
- `BETTER_AUTH_SECRET` を本番の秘密の値として入れる（`npx wrangler secret put BETTER_AUTH_SECRET`）。`BETTER_AUTH_URL` を本番の URL にする
- **匿名のアカウントを大量に作られないようにする**：いまは誰でも何度でも匿名のアカウントを作れる。Cloudflare の Rate Limiting か Turnstile を足す
- 公開の方法（Workers Builds で GitHub から出すか、手元から出すか）を決める
