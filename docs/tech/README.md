---
summary: tech の目次。技術スタック・処理的に可能な範囲・技術的な検討事項
---
# tech

| ファイル | 何が書いてあるか |
|----------|------------------|
| [`world-model.md`](world-model.md) | 世界の作り方の決まり（単位と座標系・天体の大きさの出典・自分の位置の持ち方・星のデータ形式・描画の分け方・いまの制限） |
| [`small-bodies.md`](small-bodies.md) | 太陽系の衛星と小惑星・準惑星：データの出どころ（JPL）と変換、大きさの決め方と推定、位置の精度、光の点として描く方法 |
| [`chat.md`](chat.md) | チャット（2026-11-12 にスタンプから置き換え）：送れる文、届く範囲、連打の制限、名前、左下の履歴と吹き出し、PC のキー |
| [`satellites.md`](satellites.md) | 人工衛星：軌道要素の出どころ（SatNOGS DB）と取り方、SGP4 と座標の変換、描き分け |
| [`constellations.md`](constellations.md) | 星座の線：データの出どころと星への当て方、3 次元の線にする理由、描き方 |
| [`nebulae.md`](nebulae.md) | 星雲：距離の出どころ（SIMBAD）、大きさの決め方、形の作り方と明るさ |
| [`galaxies.md`](galaxies.md) | ほかの銀河：データの出どころ（Updated Nearby Galaxy Catalog）、向きの決め方、光の点の数と形 |
| [`spacecraft.md`](spacecraft.md) | 探査機：JPL Horizons の表、位置の出し方、表の期間の外の扱い |
| [`gaia-stars.md`](gaia-stars.md) | Gaia DR3 の近くの星：選び方、HYG などとの重なりの外し方、恒星系の記号 |
| [`clusters.md`](clusters.md) | 星団：データの出どころ（Hunt & Reffert 2023）、光の玉とメンバーの星の描き分け、本物のメンバーの星 |
| [`compact-objects.md`](compact-objects.md) | 星の燃えかす（白色矮星・パルサー・ブラックホール）：データ、自動で作る割合、見た目 |
| [`ships.md`](ships.md) | 宇宙船（設計の形と版・保存・配り方・3 種類の船体）と、一人称・三人称の視点 |
| [`exoplanets.md`](exoplanets.md) | 太陽系の外の惑星：実在の系外惑星のデータの出どころと変換、恒星の見つけ方、自動で作る惑星の決まりと数の出典、軌道と見た目 |
| [`galaxy.md`](galaxy.md) | 天の川銀河のモデル（腕・中心部・ちり）、数の出典、観測と合っているかの確かめ方、銀河の光とまわりの星の作り方 |
| [`server.md`](server.md) | サーバー（Cloudflare Workers・D1・Durable Objects・Better Auth）の構成、API、ワープホールの保存、宇宙船の位置のやりとり、アカウント、手元での動かし方、本番に出す前に残っていること |
| [`credits.md`](credits.md) | 使っている外部のデータ・画像・ライブラリと、ライセンス・クレジット表記 |
| [`feasibility.md`](feasibility.md) | Web とネイティブアプリで処理的に可能な範囲、実在のデータで再現できる範囲 |
| [`astronomy-data.md`](astronomy-data.md) | 天体の計算ライブラリ（astronomy-engine）と恒星データ（HYG）の中身・できること・ライセンス |
| [`stack.md`](stack.md) | 技術スタック・選定理由。ブラウザ側の候補と推奨、選ぶ前に考えておくこと |
