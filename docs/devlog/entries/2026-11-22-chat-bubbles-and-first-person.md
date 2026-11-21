---
summary: チャットの吹き出し（白）・枠なし SNS 風スタンプ演出・一人称カメラの UFO 前方配置・相手 UFO クリックによる会話絞り込みの実装と検証記録
---
# チャットの吹き出し（白）・枠なしスタンプ・一人称カメラ位置・相手 UFO クリック

2026-11-22 のオーナーの指示により、チャット表示と一人称視点を次の 5 点で改善した（要件 F6・F28）。

## 変更した内容と理由

1. **白い吹き出し・枠なし SNS リアクションスタンプ（`src/ui/chat-bubbles.ts`, `src/ui/hud.css`）**
   - テキストの吹き出し（`.chat-bubble`）を船の色枠からシンプルな白（`#fff`・暗色文字 `#141820`・枠なし）に変更した。
   - スタンプ（絵文字 1〜2 個を `isStampText` で判定）は文字数判定（`<= 2`）だと `'OK'` や `'あ'` まで反応してしまうため、絵文字専用の正規表現で判定している。UFO の上では `.chat-reaction` / `.chat-reaction-inner` として枠・背景・尾なしで弾みながら左右にゆらぎつつ上へ浮かび（`STAMP_SHOW_MS = 2.4s`）、テキスト吹き出しを消さず複数同時に表示できる。
   - 毎フレーム位置を更新する親要素（`translate(x, y)`）と CSS キーフレームで浮遊・回転・拡縮させる子要素（`.chat-reaction-inner`）を分けることで、`transform` が競合しないようにした。
   - チャット履歴（`.hud-chat-log`）にはこれまで通りスタンプも残る。

2. **一人称視点：自分の吹き出し・スタンプ非表示とカメラ位置の前方移動（`src/controls/chase-camera.ts`, `src/render/ship-models.ts`, `src/main.ts`）**
   - `shapeDepthKm`（ブロックの Z 軸方向の長さ）を取り、一人称視点のカメラを船の中心 `(0, 0, 0)` ではなく前端から `FIRST_PERSON_MARGIN_KM = 0.002`（2 m。`camera.near = 1 m` より前）だけ前（`-Z` 方向）に置くようにした。自機モデルとベイパーは後退時にカメラを塞がないよう一人称では引き続き非表示にした。
   - 一人称視点では `SELF_BUBBLE` の位置返しを `null` にして、自分の吹き出し・スタンプだけ非表示にしている（目の前にいる他プレイヤーの UFO の上の吹き出し・スタンプは見える）。

3. **相手の UFO クリックによるチャット欄の絞り込み（`src/world/chat.ts`, `worker/space-room.ts`, `src/main.ts`, `src/ui/ChatBox.tsx`）**
   - `controls.onTap` の先頭（天体・星座の選択より前）で `pickOtherShip` を実行し、カメラ前方（カメラローカル `z < 0`）にいる他プレイヤーの UFO をクリックで選べるようにした。
   - 普段は近くの会話がチャット欄に並び、相手の UFO をクリックすると `chatFocus` が設定され、クリック時刻以降（`at >= since`）のその相手の発言と自分の返信だけをチャット欄に表示する（UFO 上の吹き出しは常に全員分が見える）。
   - 同じ UFO の再クリック、チャット欄上部の「解除」ボタン、別の UFO への切り替え、または相手が部屋から消える／クリック時の距離の 3 倍（最小 10 km）より離れる（`shouldLeaveChatFocus`）と自動で解除される。
   - 宇宙の部屋の `broadcast()` が配る `ShipSnapshot` に任意フィールド `n`（宇宙船名）を添えるようにした。タイトル画面の公開 API（`/api/earth-ships`）用の `currentShips()` には従来通り名前を付けない（要件 F53）。

4. **UFO にエイムで機体周囲のスタンプリング・From／To 表示・もらった UFO のふわふわ演出（`src/ui/ship-stamp-ring.ts`, `src/ui/chat-bubbles.ts`, `worker/space-room.ts`, `src/net/space-link.ts`）**
   - 他の UFO に照準を合わせると `ShipStampRing` が機体の画面上の半径に応じた円（`stampRingRadiusPx`）へ `CHAT_STAMPS` 8 個を並べる。PC では Pointer Lock 中にカーソルを出さず、照準をそのままスタンプに動かしてクリックできるように、リングを開いた後は `SHIP_STAMP_KEEP_PAD_PX = 56 px` のヒステリシスで開いたまま保つ。
   - クリック判定は `stampRing.pick` を `pickOtherShip` より先に走らせ、スタンプ上なら相手宛て（`to`）スタンプを送信、UFO 本体上なら会話絞り込み（`chatFocus`）へ振り分ける。
   - `worker/space-room.ts` で `to` 付きのチャットは宛先本人の存在と `isStampText` を検証し、送り主・宛先・宛先が見えている近くの船に配る。チャット欄には送った側へ `To 〇〇：スタンプ`、送られた側へ `From 〇〇：スタンプ` を出し（第三者のチャット欄には出さない）、3D 画面ではもらった UFO の周囲 4 箇所に大きさの異なる絵文字を時間差でふわふわ漂わせる（`GIFT_STAMP_SHOW_MS = 3.8 s`）。

## 確かめたこと

- `npm test`（54 ファイル・432 テスト通過。`chat.test.ts` と `chase-camera.test.ts` の追加テストを含む）
- `npm run check`、`npm run build`
- Chrome（WebGPU・WebGL2）の 3 セッションで地球近傍（80 m 間隔）に 3 隻を並べて確認：
  - 白い吹き出し（`rgb(255, 255, 255)`・枠線 `0px`）、枠なし浮遊スタンプ（`❤️`, `👋`）と履歴残存
  - 一人称視点でカメラが UFO 前端 2 m 前に移り（`camPosLen ≈ 0.01725 km`）、自機の吹き出し・スタンプのみ `display: none`、相手のものは表示されたまま
  - 相手 UFO クリックで絞り込みバーとクリック以降の会話絞り込み（他者の吹き出しは継続表示）、再クリックと 50 km 離脱で自動解除
  - Pointer Lock 中に相手 UFO へ照準を合わせて 8 個のスタンプリングが表示され、照準で `❤️` を選んでクリックすると送った側 A に `To ゲスト：❤️`、相手 B に `From ゲスト：❤️`（第三者 C には非表示）、B の UFO 周囲に 4 つのふわふわ演出が出ること、B が一人称のときは `From ゲスト：👋` のみ届き `.chat-gift` は `display: none` になること
  - スマホ幅（390×844）でチャットを開いてのスタンプ送信および UFO エイムからのスタンプリング直接タップ送信が崩れ・エラーなく動くこと
