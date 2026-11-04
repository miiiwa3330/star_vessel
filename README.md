# star_vessel

地球から飛び立ち、世界中のプレイヤーと同じ宇宙を、自分の宇宙船の一人称視点で旅する Web アプリ。

- 惑星の位置・公転・自転は、現実のいまの時刻に合わせて動く
- 星空は本物の恒星のデータ（HYG、約 12 万個）

いまは「世界の創造」の土台の段階で、太陽系と星空の中を飛べる（操縦は仮）。

## 動かし方

Node.js 24 以上。

```bash
npm install
npm run dev      # http://localhost:5173
```

| 操作 | PC | スマホ |
|------|----|--------|
| 向きを変える | ドラッグ | 1 本指でドラッグ |
| 進む | W・S（前後）、A・D（左右）、R・F（上下） | 2 本指で触れている間、前へ |
| 傾き | Q・E | — |
| 速さ | ホイール、＋・− | — |

## そのほかのコマンド

```bash
npm test         # テスト
npm run check    # 型チェック
npm run build    # ビルド（dist/）
npm run stars    # 星のデータ（public/data/stars.bin）の作り直し
```

## ドキュメント

仕様・判断・経緯は [`docs/`](docs/README.md)、作業のルールは [`AGENTS.md`](AGENTS.md)。使っている素材とライセンスは [`docs/tech/credits.md`](docs/tech/credits.md)。
