// HYG v4.4（CC BY-SA 4.0）から、ブラウザで読む星のデータ public/data/stars.bin を作る。
// 形式は docs/tech/world-model.md の「恒星のデータ形式」。使い方：npm run stars
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'tools/.cache');
const cacheFile = join(cacheDir, 'hyg_v44.csv.gz');
const outDir = join(root, 'public/data');
// Codeberg は Git LFS のファイルを /media/ から配る（/raw/ は LFS の目印の小さなファイルになる）
const SOURCE_URL = 'https://codeberg.org/astronexus/hyg/media/branch/main/data/hyg/CURRENT/hyg_v44.csv.gz';
const STRIDE = 6;

async function download() {
  if (existsSync(cacheFile)) return;
  mkdirSync(cacheDir, { recursive: true });
  console.log(`取得中: ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`取得に失敗: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf[0] !== 0x1f || buf[1] !== 0x8b) throw new Error('gzip ではないものが返った（LFS の目印かもしれない）');
  writeFileSync(cacheFile, buf);
}

// HYG の CSV は値に , を含まないが、"" で囲まれた列がある
function parseLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

await download();
const lines = gunzipSync(readFileSync(cacheFile)).toString('utf8').split('\n').filter(Boolean);
const header = parseLine(lines[0]);
const col = (name) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`列が無い: ${name}`);
  return i;
};
const [iId, iX, iY, iZ, iAbsMag, iCi, iDist] = ['id', 'x', 'y', 'z', 'absmag', 'ci', 'dist'].map(col);

const stars = [];
for (const line of lines.slice(1)) {
  const f = parseLine(line);
  if (f[iId] === '0') continue; // 太陽は太陽系の側で描く
  // 距離の分からない星（HYG では距離が 100,000 pc の仮の値）は、3 次元の場所に置けないので外す
  if (Number(f[iDist]) >= 100_000) continue;
  const ci = f[iCi] === '' ? Number.NaN : Number(f[iCi]);
  stars.push([Number(f[iX]), Number(f[iY]), Number(f[iZ]), Number(f[iAbsMag]), ci, Number(f[iId])]);
}
// 本来の明るさ（絶対等級）の明るい順に並べる。性能の低い端末では先頭から一部だけを描けばよい
stars.sort((a, b) => a[3] - b[3]);

const data = new Float32Array(stars.length * STRIDE);
stars.forEach((s, i) => data.set(s, i * STRIDE));
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'stars.bin'), Buffer.from(data.buffer));
writeFileSync(
  join(outDir, 'stars.LICENSE.txt'),
  [
    'stars.bin は HYG Database v4.4 を変換したデータです。',
    'This data is derived from the HYG Database v4.4 by David Nash (astronexus), https://codeberg.org/astronexus/hyg',
    'Licensed under the Creative Commons Attribution-ShareAlike 4.0 International License (CC BY-SA 4.0):',
    'https://creativecommons.org/licenses/by-sa/4.0/',
    'Changes: kept only x, y, z (parsec, J2000 equatorial), absolute magnitude, B-V color index and the HYG id; removed the Sun and stars without a known distance; sorted by absolute magnitude; stored as little-endian float32.',
    '',
  ].join('\n'),
);
console.log(`${stars.length} 個の星を書き出した（${(data.byteLength / 1024 / 1024).toFixed(2)} MB）`);
