---
summary: 使っている外部のデータ・画像・ライブラリと、そのライセンス・クレジット表記のしかた
---
# 素材とライセンスの一覧

外部の素材を足したら、ここに書く（AGENTS.md の「実装の方針」）。クレジット表記が要るものは、画面右下の表示（`src/ui/Hud.tsx`）にも出す。

## データ・画像

| 素材 | 置き場所 | 出どころ | ライセンス | 表記のしかた |
|------|----------|----------|------------|--------------|
| HYG Database v4.4（恒星） | `public/data/stars.bin`（変換したもの） | https://codeberg.org/astronexus/hyg（David Nash / astronexus） | CC BY-SA 4.0 | 画面に「星：HYG v4.4（CC BY-SA 4.0）」とリンク。変換したデータも CC BY-SA 4.0 で、変更点を `public/data/stars.LICENSE.txt` に書いている |
| Open Exoplanet Catalogue（系外惑星） | `public/data/exoplanets.json`（変換したもの） | https://github.com/OpenExoplanetCatalogue/open_exoplanet_catalogue（Hanno Rein ほか） | MIT | 画面に「系外惑星：Open Exoplanet Catalogue（MIT）」とリンク。著作権の表示と許諾の文を `public/data/exoplanets.LICENSE.txt` に置く（必ず json と一緒に置く） |
| JPL の衛星のデータ（平均軌道要素・物理量・Horizons） | `public/data/moons.json`（変換したもの） | https://ssd.jpl.nasa.gov/（NASA/JPL Solar System Dynamics） | NASA/JPL のデータ（著作権の制限なし。出典を書く） | 画面に「衛星・小惑星：NASA/JPL」とリンク |
| JPL Small-Body Database（小惑星） | `public/data/asteroids-*.bin`・`asteroids-large.json`（変換したもの） | https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html | 同上 | 同上 |
| SatNOGS DB（人工衛星の軌道要素） | `public/data/satellites.json`（写し）と、サーバーの `/api/satellites` | https://db.satnogs.org/（Libre Space Foundation ほか） | CC BY-SA 4.0 | 画面に「人工衛星：SatNOGS DB（CC BY-SA 4.0）」とリンク。写しは同じライセンスで、変更点を `public/data/satellites.LICENSE.txt` に書く（必ず json と一緒に置く） |
| Hunt & Reffert (2023) の星団の表 | `public/data/clusters.json`（変換したもの） | VizieR J/A+A/673/A114（ハーバード大学のミラー） | 論文のデータ。出典を書けば使える（CDS の利用の条件） | 画面に「星団・白色矮星・パルサー・ブラックホール：VizieR（Hunt & Reffert 2023 ほか）」とリンク |
| 白色矮星（Gentile Fusillo ほか 2021）・ATNF Pulsar Catalogue（Manchester ほか 2005）・BlackCAT（Corral-Santana ほか 2016） | `public/data/compact.json`（変換したもの） | VizieR J/MNRAS/508/3877・B/psr・J/A+A/587/A61（ハーバード大学のミラー） | 同上 | 同上 |
| 地球の画像（2k_earth_daymap.jpg） | `public/textures/` | https://www.solarsystemscope.com/textures/ | CC BY 4.0 | 画面に「天体の画像：Solar System Scope（CC BY 4.0）」とリンク |
| 月の画像（2k_moon.jpg） | `public/textures/` | 同上 | CC BY 4.0 | 同上 |
| 水星・金星・火星・木星・土星・天王星・海王星の画像（2k_*.jpg） | `public/textures/` | 同上 | CC BY 4.0 | 同上 |

- 2026-11-04 に、それぞれの配布元でライセンスの文を確かめた（Open Exoplanet Catalogue は 2026-11-05 に README の License の節で確かめた）
- 惑星の画像（`src/render/body-looks.ts` の `TEXTURE_FILES`）は、2026-11-05 に Solar System Scope から取得して置いた（配布元のページで CC BY 4.0 と確かめた）
- NASA/JPL のデータは、NASA の方針で著作権の制限が無い（出典を明記する）。エリス・マケマケの直径は論文の値（`docs/tech/small-bodies.md`）
- Solar System Scope の画像は、NASA の画像などをもとに作られている。CC BY 4.0 の範囲で、加工・商用利用ができる

## ライブラリ（npm）

| ライブラリ | ライセンス |
|------------|------------|
| three | MIT |
| satellite.js | MIT |
| astronomy-engine | MIT |
| react・react-dom | MIT |
| vite・vitest・@vitejs/plugin-react | MIT |
| better-auth・hono・@cloudflare/vite-plugin | MIT |
| wrangler | MIT または Apache-2.0 |
| typescript | Apache-2.0 |
