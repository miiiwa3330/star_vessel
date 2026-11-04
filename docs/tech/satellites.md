---
summary: 人工衛星（要件 F29）の作り方。軌道要素の出どころ（SatNOGS DB）と取り方、SGP4 と座標の変換、描き分け（光の点・模型）、精度の確かめ、いまの制限
---
# 人工衛星

コードは `src/world/satellites.ts`（SGP4。satellite.js はこのファイルの中だけで使う）、`src/world/satellite-data.ts`（取り込み。サーバーと共有）、`worker/satellites.ts`（API）、`src/render/satellite-field.ts`（光の点）、`tools/build-satellites.mjs`（写し）。

## 出どころ

| 項目 | 内容 |
|------|------|
| 配布元 | SatNOGS DB（https://db.satnogs.org/ 、Libre Space Foundation ほか）。**CC BY-SA 4.0**。TLE の多くは Space-Track.org 由来 |
| 対象 | SatNOGS DB の TLE すべて（2026-11-05 に 1,698 機）。宇宙ステーションに結合している部品（ISS のナウカなど）は本体と同じ場所にいるので外す |
| 取り方 | **サーバーの `GET /api/satellites` が SatNOGS から取り、6 時間キャッシュする**（Cache API）。TLE は数週間で古くなり（位置が数百〜数千 km ずれる）、リポジトリに置いた写しでは足りないため。配布元に負担をかけないようキャッシュする |
| 写し | `public/data/satellites.json`（`npm run satellites`）。API から取れないときだけ使う。古くなる |

- 最初は CelesTrak の「宇宙ステーション」と「明るい衛星」の一覧を使う予定だったが、開発の環境から CelesTrak への接続が切られる状態が続いたので、SatNOGS DB にした
- 開発サーバー（Cloudflare の Vite プラグイン）の中の Worker は、開発の環境ではプロキシを通さずに名前を引こうとして失敗する（`failed to lookup address information`）ので、`/api/satellites` は 503 になり、写しが使われる。本番の Cloudflare では外につながる想定だが、**この環境では確かめられていない**

## 位置の出し方

- SGP4（satellite.js 7）で、地球の中心から見た位置（TEME 座標）を出す
- TEME を EQJ に移す：その時刻の真の赤道・真の春分点の座標（EQD）から EQJ への回転（astronomy-engine の `Rotation_EQD_EQJ`）を使う。TEME と EQD の違い（分点差、1 秒角ほど）は無視する。回転は 1 分ごとに作り直す
- **確かめ方**：ISS の位置を JPL Horizons（2026-11-05 00:00 UT）と比べ、30 km 以内で合う（テスト。TLE の元期は 1 日前）

## 描き分け

- **光の点**：全部の衛星。毎フレームすべてを SGP4 で計算すると重いので、毎フレーム 30 分の 1 だけ計算し直し、残りは最後に計算した速度で進める（1 秒で数 m しかずれない）。地球から 100 万 km より遠いときは描かない
- **模型**：自分から 3,000 km 以内の近い順 8 機を、天体の一覧に入れる（2 秒ごとに選び直す）。箱の本体と左右の太陽電池の板の簡単な模型。大きさは ISS 109 m・中国宇宙ステーション 55 m・ほか 10 m（見た目のための値）。こちらは毎回 SGP4 で計算する
- 天体の id は `N`＋カタログ番号（例：ISS＝`N25544`）。住所は地球のまわり（`…-SOL-3-0-…`）。秒速 7〜8 km で動くので、20 km 以内では衛星を基準の天体にし、そばに止まっていられる
- レーダーには、2,000 km より近い衛星だけを出す

## いまの制限

- 模型は全部同じ形（ISS も箱と板）
- 地球以外のまわりの探査機は置いていない
- `/api/satellites` は開発の環境では確かめられていない（上）
