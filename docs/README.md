---
summary: star_vessel の docs 全体の地図。何をどこに書くか
---
# docs の地図

star_vessel の仕様・判断・経緯の正本。作業のしかた（ルール）は [`../AGENTS.md`](../AGENTS.md) にあり、ここにはサービスの中身を書く。

| ディレクトリ | 何が書いてあるか |
|--------------|------------------|
| [`concept/`](concept/README.md) | サービスの一言・体験の核・世界観の方針 |
| [`product/`](product/README.md) | 要件・機能・画面構成 |
| [`design/`](design/README.md) | 見た目・UI・演出のルール |
| [`tech/`](tech/README.md) | 技術スタック・選定理由・技術的な検討事項 |
| [`devlog/`](devlog/README.md) | 開発の経緯・判断の変遷 |

## 書き方の決まり

- 新しいファイルは frontmatter の `summary` のあとに `# タイトル`
- ディレクトリを作ったら先に README（目次）を置く
- 決まったことは「決まったこと」に日付付きで書く。決まっていないことは「決まっていないこと」に選択肢と推奨をつけて置く
