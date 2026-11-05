# AGENTS.md — star_vessel 開発ガイド（AIコーディングエージェント共通のプロジェクト指示）

このリポジトリで作業する際の前提とルールを定義する。Claude Code・Codex・Cursor など、どのAIコーディングエージェントも本ファイルを共通の指示として読む（Claude Code は v2.1.277 以降で直接読む。`CLAUDE.md` は置かない——置くと Claude Code は本ファイルを読まなくなる）。

**サービスの内容そのもの（コンセプト・体験の設計・機能仕様・世界観・技術選定の理由）は本ファイルに書かない。** それらの正本は `docs/` 配下に置く。本ファイルは「どう作業するか」だけを扱う。

> **現在の状態（2026-11-05）**：「世界の創造」の土台に、レーダー・ワープホール（全員と共有）・天体に近づける距離の制限・他のプレイヤーの宇宙船・銀河の形の自動生成を足した。さらに、惑星の模様と土星の環、天体の一覧（registry）、ガリレオ衛星、太陽系の外の惑星（実在＋自動生成）を足した。さらに、大気の光の輪・恒星の表面と光の広がり・環の影と、自動で作る系外惑星の衛星と環を足した。さらに、太陽系の衛星（187 個）・小惑星（約 90 万個）・惑星の画像、宇宙船を選ぶ機能（3 種類）、一人称・三人称の視点を足した。さらに、船を UFO の形にし、スタンプ・人工衛星・星団・星の燃えかす（白色矮星・パルサー・ブラックホール）・小さな小惑星への接近を足した。さらに、もやを消し、遠くは点・近くは実際の大きさにし、星の見え方の切り替え・天体の情報（近くの一覧・照準の先・近づいたときのカード）・訪れた天体のコレクション・地球を原点にした座標を足した。さらに、画面を整理した（操作の説明とクレジットをボタンにしまう、照準の先は 1 行、レーダーの名前が重ならない、衛星の日本語の名前）。さらに、星座の線、実データの星雲・ほかの銀河・彗星・探査機・仮符号の衛星・いて座 A*・木星などの環・地球の夜景と雲・星団の本物のメンバーの星・恒星の動きと時刻合わせを足した。さらに、動くものが飛ばないようにした（時刻・他の船・彗星の点・小惑星の点・2 秒ごとの引っかかり）。サーバーは手元（`npm run dev`）でだけ動かしていて、本番には出していない。決まり次第、本ファイルの該当節を更新する（下の「このファイルの育て方」）。

---

## プロジェクトの前提

- **宇宙を探検できるサービス**。リポジトリ名・パッケージ名などの技術識別子は `star_vessel`
- コンセプトの正本は [`docs/concept/README.md`](docs/concept/README.md)、要件の正本は [`docs/product/requirements.md`](docs/product/requirements.md)。**作業の前に読み、そこに書かれていないサービスの内容を推測で書かない。** 必要なら選択肢と推奨を示して聞く
- **要件の「決まっていないこと」を、推奨のまま決定として扱わない。** 推奨に沿って仮で作るときは、仮であることを伝える

## ミッション

1. **プロダクトの実装**
2. **docs の作成**

docs は実装の副産物ではなく、実装と同格の成果物として扱う。機能を実装したら、対応する docs の更新まで終えて「完了」とする。「あとでまとめて書く」はしない。

## 言語

**応答もドキュメントも日本語で書く。** 英語にするのはコード内の識別子とコミットメッセージだけ。

## docs は AI が管理する

**`docs/` は、基本的に AI エージェントが書く前提**で運用する。どの AI ツールでも同じ。

- **頼まれなくてもやる。** 作業が終わったら、下の「更新ルール」に従って docs を直す。人に「docs を直しておいてください」と頼まない
- **人が決めることは、勝手に決めない。** サービスの方向性・体験の設計・名前・デザインの好み・技術スタックなど、オーナーが決めることは、選択肢と推奨を示して聞く。決まったら該当する docs に日付付きで書く
- **「できた」「動いた」と書く前に確かめる。** 記録を信じず、ビルド・テスト・実際の画面で確かめ、確かめた方法も書く

---

## 最初に読むもの

| 知りたいこと | ファイル |
|--------------|----------|
| docs 全体の地図 | [`docs/README.md`](docs/README.md) |
| コンセプト・体験・世界観 | [`docs/concept/README.md`](docs/concept/README.md) |
| 要件・決まっていないこと | [`docs/product/requirements.md`](docs/product/requirements.md) |
| デザインルール | [`docs/design/README.md`](docs/design/README.md) |
| 世界の作り方（単位・座標系・自分の位置・描画の分け方） | [`docs/tech/world-model.md`](docs/tech/world-model.md) |
| 銀河のモデル（数の出典・確かめ方） | [`docs/tech/galaxy.md`](docs/tech/galaxy.md) |
| 星座・星雲・ほかの銀河・探査機・Gaia の星 | [`docs/tech/README.md`](docs/tech/README.md) から各ファイルへ |
| 素材とライセンス | [`docs/tech/credits.md`](docs/tech/credits.md) |
| 処理的に可能な範囲（Web／アプリ） | [`docs/tech/feasibility.md`](docs/tech/feasibility.md) |
| 技術スタック・選定理由 | [`docs/tech/stack.md`](docs/tech/stack.md) |
| 開発経緯・判断の変遷 | [`docs/devlog/README.md`](docs/devlog/README.md) |

---

## 作業の開始時（ブランチ）

- **`main` 上でコードを変更しない。** 着手前にブランチを切る（prefix は `feature/` `fix/` `refactor/` `docs/` `chore/`）
  - ブランチを切らずに `main` で作業する場合は、**その旨を必ず先に伝える**。黙って `main` を変更しない
- **ブランチを切る前に `main` が最新か確認する。** `git status` の「up to date」はローカルのリモート追跡 ref との比較なので、**fetch していないと古い情報で「最新」と誤判定する**。必ず fetch してから測る

```bash
git fetch origin
git rev-list --left-right --count main...origin/main   # 「0　0」なら同期済み
```

| 結果 | 対応 |
|------|------|
| `0　0`（同期済み） | そのままブランチを切る |
| **右**が 0 以外（`main` が遅れている） | **判断を仰ぐ**。①`git switch -c <branch> origin/main` ②`git checkout main && git pull` してから切る — のどちらにするか聞く |
| **左**が 0 以外（`main` にローカルコミットがある） | 勝手に pull・マージしない。先に状況を報告して指示を仰ぐ |

- コミットメッセージは変更内容が分かる英語の1行から始める。コミット・push・PR 作成は、頼まれたときだけ行う

## docs のルール

- **docs には知識、状態は別に。** 終わったら価値がなくなるもの（誰が何を済ませたか・判断待ち・着手した作業）は docs に書かず、GitHub Issue を使う（Issue を使い始めるまでは、チャットで報告する）
- **devlog は `docs/devlog/entries/YYYY-MM-DD-<slug>.md` に1テーマ1ファイル。** 経緯を残す価値があるとき（調査の結果・試してやめた案とその理由・つまずきの原因・計測値）だけ。小さな作業は不要。**何をしたかではなく、なぜそうしたか**を書く
- devlog は**その時点の記録**なので、あとから本文を書き換えない（リンク切れの修正は別）
- **新しいファイルには frontmatter の `summary` を付け、その直後に `# タイトル`。** ディレクトリを作ったら先に README（目次）を置く
- **却下した案を再提案しない。** 却下理由は docs に残し、同じ案が出たら先にそれを読む

### 更新ルール（変更内容 → 更新先）

実装・設計作業が完了するたびに、**指示がなくても**以下を更新する。

| 変更内容 | 更新先 |
|----------|--------|
| コンセプト・体験・世界観の決定 | `docs/concept/README.md` |
| 要件の追加・変更、論点の決定 | `docs/product/requirements.md` |
| 機能・画面の追加・変更 | `docs/product/` 配下の該当ファイル |
| デザインルール（色・フォント・UI 部品・演出）の追加・変更 | `docs/design/README.md` |
| 技術スタック・ライブラリの追加 | `docs/tech/stack.md` |
| 単位・座標系・位置の持ち方・描画の分け方の変更 | `docs/tech/world-model.md` |
| 銀河のモデルの数・作り方の変更 | `docs/tech/galaxy.md` |
| 外部のデータ・画像・ライブラリの追加 | `docs/tech/credits.md` |
| ディレクトリ構成の変更 | 本ファイルの「ディレクトリ構成」 |
| 設計・調査・方針変更、詰まった点、判断を変えた点 | `docs/devlog/entries/YYYY-MM-DD-<slug>.md` |
| 決定事項（何を・なぜ決めたか） | 該当する docs の「決まっていないこと」から「決まったこと」へ日付付きで移す。経緯が重要なら devlog にも残す |
| 起動手順・ユーザーから見える特長 | `README.md` |

---

## 参照範囲

**このリポジトリ以外は参照しない。** `~/Desktop/dev/` 配下の他プロジェクトは star_vessel とは無関係なサービスなので、設計や docs の根拠に使わない（本ファイルの構成を作る際に参考にしただけで、内容の依存はない）。

---

## 実装の方針

技術スタックが決まる前から効く、分野をまたいだ原則だけを置く。変える場合は理由を devlog に残す。

- **値を目測で置かない。** 実在の天体・距離・大きさ・軌道などを使うときは、出典（データ元・取得日）を docs に残す。演出のために実際と変える場合は、変えたことと理由を書く
- **外部の画像・3D モデル・データ・音は、ライセンスを確かめてから使う。** 出どころの分からない素材はリポジトリに置かない。使った素材と条件は docs に一覧で残す
- **同じ数を2か所に持たない。** 片方だけ直る状態を作らない
- **純粋なロジック（座標・物理・計算）は描画や UI から切り離した関数にし、テストする**
- **重さを落とさない。** 不要なライブラリを足さない。追加するときは `docs/tech/stack.md` に理由を書く
- **API キーやトークンはリポジトリにコミットしない**（`.env*` は `.gitignore` に入れる）。課金・個人情報を扱う実装は、事前に方針を示して確認を取る

---

## 技術スタック

選定理由・使い方の決まりの正本は **[`docs/tech/stack.md`](docs/tech/stack.md)**。ここには概要だけを書く。

- **ブラウザ側（2026-11-04 決定）**：TypeScript ＋ Vite ＋ Vitest。描画は three.js（`three/webgpu`）。世界の計算と描画は three.js を直接使い、操縦席の表示・メニューだけを React で作る。天体の計算は astronomy-engine、恒星のデータは HYG v4.4（中身と注意点は [`docs/tech/astronomy-data.md`](docs/tech/astronomy-data.md)）
- **サーバー側・公開先（2026-11-05 決定）**：Cloudflare（Workers・D1・Durable Objects）、アカウントは Better Auth。言語は TypeScript
- 天体の計算ライブラリは、直接あちこちから呼ばず、自分たちの関数で包んで使う（差し替えられるようにするため）
- HYG（CC BY-SA 4.0）など、クレジット表記が要るデータを使ったら、表記のしかたを docs に残す

## コマンド

| 用途 | コマンド |
|------|----------|
| 最初の準備 | `cp .dev.vars.example .dev.vars`（秘密の値を入れる）→ `npm run db:migrate`（手元の D1 にテーブルを作る） |
| 開発サーバー | `npm run dev`（http://localhost:5173 。Worker の `/api/` も一緒に動く。AI が起動するときはバックグラウンドで `npx vite --port 5173 --strictPort` を実行し、終わったら止める。**人が動かしている開発サーバーは止めない**。ポートが使われていたら、それを使うか、別のポートで起動する） |
| アカウントのテーブルの SQL | `npm run auth:schema`（Better Auth の設定を変えたら作り直し、差分を新しいマイグレーションにする） |
| テスト | `npm test`（Vitest。天体の位置・向き、星の見た目、自分の位置の計算） |
| 型チェック | `npm run check`（Cloudflare の型を作り直してから、ブラウザ側と Worker 側の両方を確かめる） |
| ビルド | `npm run build`（型チェック → `dist/`） |
| 星のデータの作り直し | `npm run stars`（HYG を取得して `public/data/stars.bin` を書き出す。取得した元データは `tools/.cache/` に置き、コミットしない） |
| 系外惑星のデータの作り直し | `npm run exoplanets`（Open Exoplanet Catalogue を git で取得して `public/data/exoplanets.json` を書き出す。星のデータを作り直したら、これも作り直す） |
| 衛星・小惑星のデータの作り直し | `npm run moons`・`npm run asteroids`（JPL から取得。衛星の日本語の名前は Wikidata から。衛星は元期から離れるほどずれるので年に一度くらい。Node の fetch をプロキシ越しに使うため `NODE_USE_ENV_PROXY=1` を付けている） |
| 人工衛星・星団・燃えかすのデータの作り直し | `npm run satellites`・`npm run clusters`・`npm run compact`（星団と燃えかすは VizieR のハーバード大学のミラーから取る。CDS の本家は開発の環境から応答が無い） |
| 星座・彗星・探査機・星雲・銀河のデータの作り直し | `npm run constellations`（星のデータが先に要る）・`npm run comets`・`npm run spacecraft`・`npm run nebulae`・`npm run galaxies`。探査機は Horizons の予報が伸びたら。`npm run exoplanets` は NASA Exoplanet Archive の分も足す |
| 本物の星の作り直し | `npm run cluster-members`（`npm run clusters` が先）・`npm run gaia`（`npm run stars`・`exoplanets`・`compact` が先。数分かかる） |

- **「動いた」と書く前に、画面で確かめる。** テストが通っても、描画の向き・明るさ・重なりは画面でしか分からない。WebGPU と WebGL2（WebGPU を消した状態）の両方と、スマホの幅（390px 前後）で見る
- 開発サーバーでは、ブラウザの開発者ツールから瞬間移動できる：`__sv.teleportGalacto({ x: 0, y: 0, z: 45 })`（銀河中心の座標・kpc。この例は銀河の真上）、`__sv.teleportPc({ x, y, z })`（太陽中心の EQJ・pc）、`__sv.teleportBody('Saturn', 400000, 'pole')`（天体の id、中心からの距離 km、どこから見るか：`'day'` 昼の側〈省略時〉・`'pole'` 北極の上・`'night'` 夜の側）、`__sv.teleportSystem('E1WHADEK', 0.1)`（恒星系の記号と恒星からの距離 AU。この例は TRAPPIST-1）。描いている物は `__sv.debug` から読める（動きの滑らかさを測るときなど）。本番のビルドには入らない
- 小惑星（約 90 万個）はソフトウェアの描画（GPU の無い環境の自動の確かめ）では重すぎるので、URL に `?asteroids=bright` を付けて明るい約 7.6 万個だけにする。Gaia の星も重いので `?stars=hyg` で読まないようにできる
- 他のプレイヤーの機能を確かめるときは、別々のブラウザ（別のアカウントになる）を 2 つ開く

## ディレクトリ構成

```
src/
  main.ts                 起動と毎フレームのループ（世界の更新 → 描画 → 画面の表示）
  world/                  世界の計算。three.js も React も使わない純粋な関数（テストはここに集める）
    solar-system.ts       天体の一覧（registry）と、位置と向き。astronomy-engine はこのファイルの中だけで使う
    kepler.ts             ケプラーの軌道（系外惑星などの公転）
    planets.ts            太陽系の外の恒星系の天体（実在の惑星と、自動で作る惑星）
    star-systems.ts       恒星系の記号から恒星を引き、いる恒星系の天体を一覧に入れ替える
    exoplanet-data.ts     実在の系外惑星のデータの読み方
    small-bodies.ts       太陽系の衛星と大きな小惑星・準惑星（データから天体の一覧を作る）
    ship-design.ts        宇宙船の設計の形と確かめ方（サーバーと共有）
    stamps.ts             スタンプ（サーバーと共有）
    info.ts               天体の情報（種類・カードの説明・照準の先・近くの恒星）
    visits.ts             訪れた天体のコレクションの記録の形と確かめ方（サーバーと共有）
    asteroid-search.ts    近くの小惑星を探す
    satellites.ts         人工衛星（SGP4。satellite.js はこのファイルの中だけで使う）。satellite-data.ts は取り込み（サーバーと共有）
    clusters.ts           星団
    constellations.ts     星座の線
    comets.ts             彗星（楕円・放物線・双曲線の位置、尾の長さ）
    spacecraft.ts         探査機（Horizons の表の補間）
    nebulae.ts            星雲（読み方・形を作る）
    galaxies.ts           ほかの銀河（読み方・向き・形を作る）
    compact-objects.ts    星の燃えかす（白色矮星・パルサー・ブラックホール）
    surface.ts            天体の表面の模様と環を自動で描く（画像が無い天体のため）
    observer.ts           自分の位置（基準の天体からの相対位置）
    collision.ts          天体に近づける距離
    warp.ts / radar.ts    ワープホール、レーダーの計算
    galaxy.ts / random.ts 銀河のモデルと、誰の端末でも同じになる乱数（サーバーと共有）
    ship-schema.ts        宇宙船のやりとりの形と確かめ方（サーバーと共有）
    ships.ts              近い船を選ぶ・位置の予測
    address.ts            宇宙の住所（サーバーと共有）
    warp-schema.ts        ワープホールの形と確かめ方（サーバーと共有）
    stars.ts              星のデータの読み方と、見た目（大きさ・明るさ・色）
    clock.ts              世界の時刻（サーバーの時計に、飛ばさずに合わせる）
    ship-smoothing.ts     他の船を滑らかに動かす（位置の食い違いを少しずつ消す・向きを少しずつ回す）
    units.ts / vec.ts     単位と、倍精度のベクトル・行列
  render/                 three.js での描画（太陽系・星・銀河・ワープホール・他の船）。body-looks.ts は天体の画像のファイル名と模様の色、
                          body-effects.ts は大気・恒星の光・環の影、surface-worker.ts は模様を描く Web Worker、
                          asteroid-field.ts は小惑星の光の点（GPU でケプラーの方程式を解く）、ship-models.ts は 3 種類の UFO、
                          satellite-field.ts は人工衛星の光の点、cluster-view.ts は星団、constellation-view.ts は星座の線、
                          comet-field.ts は彗星の光の点、nebula-view.ts は星雲、extragalactic-view.ts はほかの銀河
  controls/flight.ts      操縦（仮）。chase-camera.ts は一人称・三人称の視点
  ui/                     画面の表示（React）。hud-store.ts を通して世界から値を受け取り、hudActions で世界へ操作を渡す。
                          stamp-bubbles.ts はスタンプの吹き出し（毎フレーム動かすので DOM を直接動かす）。
                          info-controller.ts は天体の情報とコレクションをつなぐところ、target-marker.ts は選んだ天体の印
  net/                    サーバーとのやりとり（アカウント・ワープホールの API・宇宙の部屋の WebSocket）
public/
  data/stars.bin          星のデータ（npm run stars で作る。stars.LICENSE.txt と必ず一緒に置く）
  data/exoplanets.json    系外惑星のデータ（npm run exoplanets で作る。exoplanets.LICENSE.txt と必ず一緒に置く）
  data/moons.json         衛星のデータ（npm run moons）
  data/asteroids-*.bin    小惑星のデータ（npm run asteroids。asteroids-large.json に大きな天体とファイルの一覧）
  data/satellites.json    人工衛星の軌道要素の写し（npm run satellites。satellites.LICENSE.txt と必ず一緒に置く。ふだんはサーバーが取ってくる）
  data/clusters.json      星団（npm run clusters）
  data/compact.json       白色矮星・パルサー・ブラックホール（npm run compact）
  data/constellations.json 星座の線（npm run constellations。constellations.LICENSE.txt と必ず一緒に置く）
  data/comets.json・spacecraft.json・nebulae.json・galaxies.json  彗星・探査機・星雲・銀河（それぞれ npm run の同じ名前）
  data/stars-motion.bin   星の動き（npm run stars。stars.bin と同じ順）
  data/stars-gaia-*.bin   Gaia DR3 の近くの星（npm run gaia。stars-gaia.LICENSE.txt と必ず一緒に置く）
  data/cluster-members/   星団の本物のメンバーの星（npm run cluster-members。目次は cluster-members.json）
  textures/               天体の画像（出どころは docs/tech/credits.md）
worker/                   サーバー（Cloudflare Workers）。index.ts が入口、warps.ts がワープホールの API、ships.ts が宇宙船の設計の API、visits.ts が訪れた天体の API、satellites.ts が人工衛星の軌道要素の API、space-room.ts が宇宙の部屋（Durable Object）、auth*.ts がアカウント
migrations/               D1 のテーブル（0001 は npm run auth:schema で作ったもの）
tools/build-stars.mjs     HYG → stars.bin の変換
tools/build-exoplanets.mjs Open Exoplanet Catalogue → exoplanets.json の変換（stars.bin が先に要る）
tools/build-moons.mjs     JPL（衛星の表・Horizons）→ moons.json。build-moon-names.mjs が Wikidata から日本語の名前を足す
tools/build-asteroids.mjs JPL Small-Body Database → asteroids-*.bin・asteroids-large.json
tools/build-satellites.mjs SatNOGS DB → satellites.json
tools/build-clusters.mjs  Hunt & Reffert 2023（VizieR のミラー）→ clusters.json
tools/build-compact.mjs   白色矮星・パルサー・ブラックホールの一覧（VizieR のミラー）→ compact.json
tools/build-constellations.mjs d3-celestial → constellations.json
tools/build-comets.mjs・build-spacecraft.mjs  JPL → comets.json・spacecraft.json
tools/build-nebulae.mjs・build-galaxies.mjs   SIMBAD・OpenNGC・VizieR → nebulae.json・galaxies.json
tools/build-exoplanets-nasa.mjs NASA Exoplanet Archive にだけある惑星を exoplanets.json に足す
tools/build-cluster-members.mjs・build-gaia.mjs 星団のメンバー（VizieR のミラー）・Gaia DR3（GAVO）→ 本物の星
tools/gen-auth-schema.ts  Better Auth のテーブルの SQL を作る
docs/                     仕様・判断・経緯の正本（地図は docs/README.md）
```

- 世界の計算は `src/world/` に置き、three.js・React を読み込まない。描画や画面から切り離してテストするため
- サーバーと共有する `src/world/address.ts`・`warp-schema.ts`・`ship-schema.ts`・`visits.ts`・`galaxy.ts`・`random.ts` は、astronomy-engine・DOM も読み込まない（Worker に余計なものを入れないため）
- **自動で生成するもの（銀河・星）は、誰の端末でも同じ結果にする。** 乱数は `src/world/random.ts` を使い、`Math.random` を使わない。数（星の数など）を決める計算に対数・指数を使わない（ブラウザによって最後の桁が違うことがある）
- **サーバーは、ブラウザから受け取ったものを必ず確かめてから使う**（`isWarpPlacement` など）。秘密の値（`.dev.vars`）はコミットしない
- 外部の素材（データ・画像）を足したら、[`docs/tech/credits.md`](docs/tech/credits.md) に書き、表記が要るものは画面のクレジットにも出す

---

## このファイルの育て方

- 技術スタックを決めたら「技術スタック」「コマンド」「ディレクトリ構成」を更新し、冒頭の「現在の状態」を直す
- 繰り返し起きた手戻りや、人から受けた指摘は、再発防止のルールとして該当節に日付付きで追記する
- 本ファイルは「どう作業するか」だけを扱う。サービスや仕様の内容を書きたくなったら `docs/` に書き、ここからはリンクで指す
