---
summary: 使っている外部のデータ・画像・ライブラリと、そのライセンス・クレジット表記のしかた
---
# 素材とライセンスの一覧

外部の素材を足したら、ここに書く（AGENTS.md の「実装の方針」）。クレジット表記が要るものは、画面右下の表示（`src/ui/Hud.tsx`）にも出す。

## データ・画像

| 素材 | 置き場所 | 出どころ | ライセンス | 表記のしかた |
|------|----------|----------|------------|--------------|
| HYG Database v4.4（恒星） | `public/data/stars.bin`（変換したもの） | https://codeberg.org/astronexus/hyg（David Nash / astronexus） | CC BY-SA 4.0 | 画面に「星：HYG v4.4（CC BY-SA 4.0）」とリンク。変換したデータも CC BY-SA 4.0 で、変更点を `public/data/stars.LICENSE.txt` に書いている |
| 地球の画像（2k_earth_daymap.jpg） | `public/textures/` | https://www.solarsystemscope.com/textures/ | CC BY 4.0 | 画面に「地球・月の画像：Solar System Scope（CC BY 4.0）」とリンク |
| 月の画像（2k_moon.jpg） | `public/textures/` | 同上 | CC BY 4.0 | 同上 |

- 2026-11-04 に、それぞれの配布元でライセンスの文を確かめた
- Solar System Scope の画像は、NASA の画像などをもとに作られている。CC BY 4.0 の範囲で、加工・商用利用ができる

## ライブラリ（npm）

| ライブラリ | ライセンス |
|------------|------------|
| three | MIT |
| astronomy-engine | MIT |
| react・react-dom | MIT |
| vite・vitest・@vitejs/plugin-react | MIT |
| better-auth・hono・@cloudflare/vite-plugin | MIT |
| wrangler | MIT または Apache-2.0 |
| typescript | Apache-2.0 |
