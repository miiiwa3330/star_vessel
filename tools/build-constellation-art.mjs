// 星座の絵 public/textures/constellations/*.png と、その置き方 public/data/constellation-art.json を作る。
// 使い方：npm run constellation-art（先に npm run stars。HYG の表から、絵を合わせる星の方向を引く）
// 出どころ：Stellarium の「modern」の星座の絵（skycultures/modern。絵は Free Art License 1.3。絵は変えずにそのまま置く）。
// 絵 1 枚につき、絵の上の 3 つの点と、その点に合わせる星（ヒッパルコス番号）が決まっている。星の方向（J2000 の赤道座標）に直して書き出す。
// 決まりは docs/tech/constellations.md
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'tools/.cache/stellarium');
const outDir = join(root, 'public/textures/constellations');
mkdirSync(cacheDir, { recursive: true });
mkdirSync(outDir, { recursive: true });
const COMMIT = '550301e5f7550e329365bb0d222e55bd7db28670';
const base = `https://raw.githubusercontent.com/Stellarium/stellarium/${COMMIT}/skycultures/modern`;

async function cached(name, path) {
  const file = join(cacheDir, name);
  if (existsSync(file)) return readFileSync(file);
  console.log(`取得中: ${base}/${path}`);
  const res = await fetch(`${base}/${path}`);
  if (!res.ok) throw new Error(`取得に失敗: ${path} ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(file, buf);
  return buf;
}

const index = JSON.parse((await cached(`index-${COMMIT.slice(0, 7)}.json`, 'index.json')).toString('utf8'));

// ヒッパルコス番号 → 方向（単位ベクトル。J2000 の赤道座標）
const csv = gunzipSync(readFileSync(join(root, 'tools/.cache/hyg_v44.csv.gz'))).toString('utf8').split('\n');
const header = csv[0].split(',').map((h) => h.replace(/"/g, ''));
const c = Object.fromEntries(['hip', 'ra', 'dec'].map((k) => [k, header.indexOf(k)]));
const DEG = Math.PI / 180;
const dirOf = new Map();
for (const line of csv.slice(1)) {
  if (!line) continue;
  const f = line.split(',').map((v) => v.replace(/"/g, ''));
  if (!f[c.hip]) continue;
  const ra = Number(f[c.ra]) * 15 * DEG;
  const dec = Number(f[c.dec]) * DEG;
  dirOf.set(Number(f[c.hip]), [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]);
}

const round = (v) => Math.round(v * 1e6) / 1e6;
const art = {};
const missing = [];
for (const con of index.constellations) {
  const id = con.id.replace(/^CON modern /, '');
  if (!con.image) {
    missing.push(id);
    continue;
  }
  const anchors = con.image.anchors.map((a) => {
    const d = dirOf.get(a.hip);
    if (!d) throw new Error(`${id}: HIP ${a.hip} が HYG に無い`);
    return [a.pos[0], a.pos[1], ...d.map(round)];
  });
  if (anchors.length !== 3) throw new Error(`${id}: 合わせる点が 3 つではない`);
  const name = con.image.file.replace(/^illustrations\//, '');
  writeFileSync(join(outDir, name), await cached(name, con.image.file));
  art[id] = { file: name, size: con.image.size, anchors };
}

writeFileSync(
  join(root, 'public/data/constellation-art.json'),
  JSON.stringify({
    source: `Stellarium ${COMMIT} skycultures/modern (illustrations: Free Art License 1.3). Anchor stars replaced with J2000 unit vectors from HYG v4.4.`,
    fields: 'art[IAU abbreviation] = { file (public/textures/constellations/), size [w, h] (px), anchors: 3 × [px, py, x, y, z] (image pixel from top-left, unit vector EQJ) }',
    art,
  }),
);
writeFileSync(
  join(root, 'public/data/constellation-art.LICENSE.txt'),
  `星座の絵（public/textures/constellations/*.png）と constellation-art.json は、Stellarium の星座の絵とその置き方のデータです。
https://github.com/Stellarium/stellarium （skycultures/modern。commit ${COMMIT}）

絵：Stellarium の開発者たち（星座の絵は Johan Meuris）。Free Art License 1.3（https://artlibre.org/licence/lal/en/）。
絵は変えずにそのまま置いています。この絵を写して配る・変えて配るときは、同じ Free Art License 1.3 に従ってください
（作者の名前と、もとの絵の場所を示すこと。変えたものも同じライセンスにすること）。

置き方のデータ（絵の上の点と、合わせる星）：CC BY-SA 4.0（Stellarium の skycultures/modern の "Text and data"）。
合わせる星は、ヒッパルコス番号から、HYG v4.4（CC BY-SA 4.0）の赤経・赤緯の方向に置き換えています。
`,
);
console.log(`絵 ${Object.keys(art).length} 枚。絵の無い星座：${missing.join('・')}`);
