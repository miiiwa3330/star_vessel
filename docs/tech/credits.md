---
summary: 使っている外部のデータ・画像・ライブラリと、そのライセンス・クレジット表記のしかた
---
# 素材とライセンスの一覧

外部の素材を足したら、ここに書く（AGENTS.md の「実装の方針」）。クレジット表記が要るものは、**タイトル画面の詳細（スクロールした先）の、いちばん下の「CREDITS」**（`src/top/Credits.tsx`）にまとめて出す。準備画面の下にも、地球の画像の 1 行を出す。

**2026-11-06 にオーナーの指示で、世界の画面（`/play`）の左下の「クレジット」は、やめた。** それまでは、世界の画面の左下のボタンで、同じ内容を開けた。以下の表の「画面に〜と出している」は、いまは、タイトル画面の詳細の「CREDITS」のこと。**`/play` を直接開いた人には、出典が出ない**（タイトル画面を通れば見られる）。CC BY・CC BY-SA は、媒体に合った妥当な方法での表記を求める。タイトル画面の詳細で足りるかは、公開の前に確かめる（足りなければ、世界の画面に、「CREDITS」へのリンクを 1 つ置く）。

## データ・画像

| 素材 | 置き場所 | 出どころ | ライセンス | 表記のしかた |
|------|----------|----------|------------|--------------|
| HYG Database v4.4（恒星） | `public/data/stars.bin`（変換したもの） | https://codeberg.org/astronexus/hyg（David Nash / astronexus） | CC BY-SA 4.0 | 画面に「星：HYG v4.4（CC BY-SA 4.0）」とリンク。変換したデータも CC BY-SA 4.0 で、変更点を `public/data/stars.LICENSE.txt` に書いている |
| Open Exoplanet Catalogue（系外惑星） | `public/data/exoplanets.json`（変換したもの） | https://github.com/OpenExoplanetCatalogue/open_exoplanet_catalogue（Hanno Rein ほか） | MIT | 画面に「系外惑星：Open Exoplanet Catalogue（MIT）」とリンク。著作権の表示と許諾の文を `public/data/exoplanets.LICENSE.txt` に置く（必ず json と一緒に置く） |
| JPL の衛星のデータ（平均軌道要素・物理量・Horizons） | `public/data/moons.json`（変換したもの） | https://ssd.jpl.nasa.gov/（NASA/JPL Solar System Dynamics） | NASA/JPL のデータ（著作権の制限なし。出典を書く） | 画面に「衛星・小惑星：NASA/JPL」とリンク |
| Wikidata（衛星の日本語の名前） | `public/data/moons.json` の `nameJa` | https://www.wikidata.org/ （SPARQL で取得） | CC0 | 表記は要らないが、画面のクレジットに「衛星の名前：Wikidata（CC0）」と出している |
| JPL Small-Body Database（小惑星） | `public/data/asteroids-*.bin`・`asteroids-large.json`（変換したもの） | https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html | 同上 | 同上 |
| SatNOGS DB（人工衛星の軌道要素） | `public/data/satellites.json`（写し）と、サーバーの `/api/satellites` | https://db.satnogs.org/（Libre Space Foundation ほか） | CC BY-SA 4.0 | 画面に「人工衛星：SatNOGS DB（CC BY-SA 4.0）」とリンク。写しは同じライセンスで、変更点を `public/data/satellites.LICENSE.txt` に書く（必ず json と一緒に置く） |
| Hunt & Reffert (2023) の星団の表 | `public/data/clusters.json`（変換したもの） | VizieR J/A+A/673/A114（ハーバード大学のミラー） | 論文のデータ。出典を書けば使える（CDS の利用の条件） | 画面に「星団・白色矮星・パルサー・ブラックホール：VizieR（Hunt & Reffert 2023 ほか）」とリンク |
| 白色矮星（Gentile Fusillo ほか 2021）・ATNF Pulsar Catalogue（Manchester ほか 2005）・BlackCAT（Corral-Santana ほか 2016） | `public/data/compact.json`（変換したもの） | VizieR J/MNRAS/508/3877・B/psr・J/A+A/587/A61（ハーバード大学のミラー） | 同上 | 同上 |
| d3-celestial（星座の線と名前） | `public/data/constellations.json`（変換したもの。`constellations.LICENSE.txt`） | https://github.com/ofrohn/d3-celestial（Olaf Frohn） | BSD 3-Clause | 画面に「星座の線：d3-celestial（BSD 3-Clause）」とリンク。著作権の表示と許諾の文を LICENSE に添える |
| JPL Small-Body Database（彗星）・JPL Horizons（探査機・仮符号の衛星） | `public/data/comets.json`・`spacecraft.json`・`moons.json` | https://ssd-api.jpl.nasa.gov/ ・ https://ssd.jpl.nasa.gov/horizons/ | NASA/JPL のデータ（著作権の制限なし。出典を書く） | 画面に「探査機・彗星：NASA/JPL」 |
| SIMBAD（星雲の位置・距離の測定値・大きさ） | `public/data/nebulae.json`（変換したもの） | https://simbad.cfa.harvard.edu/（CDS。ハーバード大学のミラー） | 出典を書けば使える（CDS の利用の条件） | 画面に「星雲：SIMBAD、OpenNGC」とリンク |
| OpenNGC（星雲の大きさ・銀河の長軸の向き） | `public/data/nebulae.json`・`galaxies.json`（変換したもの） | https://github.com/mattiaverga/OpenNGC（Mattia Verga） | CC BY-SA 4.0 | 画面に「OpenNGC（CC BY-SA 4.0）」とリンク |
| Updated Nearby Galaxy Catalog（Karachentsev ほか 2013） | `public/data/galaxies.json`（変換したもの） | VizieR J/AJ/145/101（ハーバード大学のミラー） | 論文のデータ。出典を書けば使える（CDS の利用の条件） | 画面に「銀河：Karachentsev ほか 2013（VizieR）」 |
| NASA Exoplanet Archive（系外惑星） | `public/data/exoplanets.json` に足した | https://exoplanetarchive.ipac.caltech.edu/ | 公開データ。使ったことの表記を求められる | 画面に「系外惑星（追加）：NASA Exoplanet Archive」とリンク |
| Hunt & Reffert (2023) の星団のメンバー（Gaia DR3 の星） | `public/data/cluster-members/`（変換したもの） | VizieR J/A+A/673/A114/members（ハーバード大学のミラー） | 出典を書けば使える（CDS の利用の条件）。もとの Gaia のデータは下の行 | 画面の星団のクレジットに含む |
| ESA Gaia DR3（近くの星） | `public/data/stars-gaia-*.bin`（変換したもの。`stars-gaia.LICENSE.txt`） | GAVO の TAP（https://dc.g-vo.org/tap。`gcns.main`・`gaia.dr3lite`）。もとは ESA と Gaia Collaboration, Smart ほか 2021 | CC BY-SA 3.0 IGO | 画面に「星（近く）：ESA Gaia DR3（CC BY-SA 3.0 IGO）」とリンク。[`gaia-stars.md`](gaia-stars.md) |
| 地球の夜の灯りと雲の画像（2k_earth_nightmap.jpg・2k_earth_clouds.jpg） | `public/textures/` | https://www.solarsystemscope.com/textures/ | CC BY 4.0 | 画面に「天体の画像：Solar System Scope（CC BY 4.0）」とリンク。タイトル画面・準備画面でも使うので、下の端に「地球の画像：Solar System Scope（CC BY 4.0）」を小さく出す |
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
| @better-auth/passkey と、それが使う @simplewebauthn/browser・server、@peculiar/*、@hexagon/base64、@levischuck/tiny-cbor、tsyringe、pvtsutils、pvutils | MIT |
| asn1js（パスキーが使う） | BSD-3-Clause |
| reflect-metadata（パスキーが使う） | Apache-2.0 |
| tslib（パスキーが使う） | 0BSD |
| X のロゴ（タイトル画面の右上のアイコン。X への外部リンク） | `src/top/SocialLinks.tsx`（図形だけの SVG） | X Corp.（https://x.com） | X の商標（ロゴ）。リンク先を示す目的で使う | 画面に表記は出さない。公開の前に、X のブランドガイドラインを確かめる |
| Miiiwa のロゴ（右上のアイコン） | `src/top/SocialLinks.tsx`（図形だけの SVG） | オーナー自身のロゴ（オーナーの `miwa_portfolio` の `src/app/icon.svg` の形）。オーナーの指示で参照した（2026-11-06） | オーナーのもの | 表記は要らない。もとの黒い棒を、暗い背景のために明るい色にしている |
| @fontsource/monoton（書体 Monoton。タイトル画面の名前。woff2 を配る） | OFL-1.1（SIL Open Font License）。著作権表示は「Copyright (c) 2011, Vernon Adams」。ライセンスの全文は `public/licenses/monoton.OFL.txt` |
| @fontsource/josefin-sans（書体 Josefin Sans。「-START-」。woff2 を配る） | OFL-1.1。著作権表示は「Copyright 2010 The Josefin Sans Project Authors」。ライセンスの全文は `public/licenses/josefin-sans.OFL.txt` |
| wrangler | MIT または Apache-2.0 |
| typescript | Apache-2.0 |
