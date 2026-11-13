// 恒星の名前と見え方の表 public/data/star-info.json を作る（コレクションの図鑑・情報のカード。2026-11-12）。
// HYG v4.4（CC BY-SA 4.0。npm run stars が取得した tools/.cache/hyg_v44.csv.gz を使う）から、
// 固有名（proper）のある恒星と、系外惑星のある恒星（exoplanets.json の H…）だけを取り出す。使い方：npm run star-info
// 決まりは docs/tech/collection.md。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheFile = join(root, 'tools/.cache/hyg_v44.csv.gz');
if (!existsSync(cacheFile)) throw new Error('先に npm run stars で HYG を取得してください');

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

const hosts = new Set(
  JSON.parse(readFileSync(join(root, 'public/data/exoplanets.json'), 'utf8'))
    .systems.map((s) => s.code)
    .filter((c) => /^H\d+$/.test(c))
    .map((c) => Number(c.slice(1))),
);

const lines = gunzipSync(readFileSync(cacheFile)).toString('utf8').split('\n').filter(Boolean);
const header = parseLine(lines[0]);
const col = (name) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`列が無い: ${name}`);
  return i;
};
const [iId, iProper, iBf, iSpect, iMag, iCon, iDist] = ['id', 'proper', 'bf', 'spect', 'mag', 'con', 'dist'].map(col);

const out = [];
for (const line of lines.slice(1)) {
  const f = parseLine(line);
  const id = Number(f[iId]);
  if (id === 0) continue; // 太陽
  if (Number(f[iDist]) >= 100_000) continue; // 距離の分からない星は stars.bin にも無い
  const proper = f[iProper].trim();
  if (!proper && !hosts.has(id)) continue;
  const mag = f[iMag] === '' ? null : Math.round(Number(f[iMag]) * 100) / 100;
  out.push([id, proper || null, f[iBf].trim() || null, f[iSpect].trim() || null, mag, f[iCon].trim() || null]);
}
out.sort((a, b) => a[0] - b[0]);
writeFileSync(
  join(root, 'public/data/star-info.json'),
  JSON.stringify({
    source: 'HYG Database v4.4 (CC BY-SA 4.0), https://codeberg.org/astronexus/hyg',
    fields: 'id (HYG), proper name, Bayer/Flamsteed, spectral type, apparent magnitude (V), constellation (IAU abbreviation)',
    stars: out,
  }),
);
writeFileSync(
  join(root, 'public/data/star-info.LICENSE.txt'),
  [
    'star-info.json は HYG Database v4.4 を変換したデータです。',
    'This data is derived from the HYG Database v4.4 by David Nash (astronexus), https://codeberg.org/astronexus/hyg',
    'Licensed under the Creative Commons Attribution-ShareAlike 4.0 International License (CC BY-SA 4.0):',
    'https://creativecommons.org/licenses/by-sa/4.0/',
    'Changes: kept only stars with a proper name or with known exoplanets, and only the columns id, proper, bf, spect, mag, con; magnitudes rounded to 0.01.',
    '',
  ].join('\n'),
);
console.log(`${out.length} 個の恒星（固有名 ${out.filter((s) => s[1]).length} 個）を書き出した`);
