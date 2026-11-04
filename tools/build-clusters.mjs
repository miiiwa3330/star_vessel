// 星団の一覧 public/data/clusters.json を作る。使い方：npm run clusters
// 出どころ：Hunt & Reffert (2023), A&A 673, A114「Improving the open cluster census. II.」の clusters の表（VizieR J/A+A/673/A114）。
// CDS の本家（vizier.cds.unistra.fr）は開発の環境から応答が無かったので、同じデータのハーバード大学のミラーから取る。
// 形と決め方は docs/tech/clusters.md
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'tools/.cache');
mkdirSync(cacheDir, { recursive: true });
const cacheFile = join(cacheDir, 'hunt-reffert-2023.tsv');
const FIELDS = ['Name', 'AllNames', 'Type', 'N', 'RA_ICRS', 'DE_ICRS', 'dist50', 'r50pc', 'rtpc', 'logAge50'];
const URL =
  'https://vizier.cfa.harvard.edu/viz-bin/asu-tsv?-source=J/A%2BA/673/A114/clusters&-out=' + FIELDS.join(',') + '&-out.max=20000';

if (!existsSync(cacheFile)) {
  console.log(`取得中: ${URL}`);
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`取得に失敗: ${res.status}`);
  writeFileSync(cacheFile, await res.text());
}

/**
 * よく知られた星団の日本語の名前。表の主な名前（Name の列）で探す
 * （別名の一覧 AllNames で探すと、別の星団の別名にも同じ名前が入っていて取り違えるため）
 */
const NAMES_JA = {
  Melotte_22: 'プレアデス星団（すばる）',
  Melotte_25: 'ヒアデス星団',
  NGC_2632: 'プレセペ星団',
  NGC_104: 'きょしちょう座 47（47 Tuc）',
  NGC_5139: 'オメガ星団',
  NGC_6205: 'ヘルクレス座球状星団（M13）',
  NGC_869: 'ペルセウス座二重星団 h',
  NGC_884: 'ペルセウス座二重星団 χ',
  NGC_6475: 'M7（トレミー星団）',
  NGC_6121: 'M4',
  NGC_7078: 'M15',
  NGC_6656: 'M22',
};

const DEG = Math.PI / 180;
const lines = readFileSync(cacheFile, 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
// 1 行目が列の名前、2 行目が単位、3 行目が区切り線
const header = lines[0].split('\t').map((s) => s.trim());
const col = Object.fromEntries(FIELDS.map((f) => [f, header.indexOf(f)]));
const out = [];
const skipped = { movingGroup: 0, noDistance: 0, other: 0 };
for (const line of lines.slice(3)) {
  const f = line.split('\t').map((s) => s.trim());
  const type = f[col.Type];
  if (type === 'm') {
    skipped.movingGroup++;
    continue;
  }
  if (type !== 'o' && type !== 'g') {
    skipped.other++;
    continue;
  }
  const ra = Number(f[col.RA_ICRS]);
  const dec = Number(f[col.DE_ICRS]);
  const dist = Number(f[col.dist50]);
  const r50 = Number(f[col.r50pc]);
  if (![ra, dec, dist, r50].every(Number.isFinite) || dist <= 0) {
    skipped.noDistance++;
    continue;
  }
  const ja = NAMES_JA[f[col.Name]] ?? null;
  const pos = [Math.cos(dec * DEG) * Math.cos(ra * DEG), Math.cos(dec * DEG) * Math.sin(ra * DEG), Math.sin(dec * DEG)].map(
    (v) => Number((v * dist).toPrecision(7)),
  );
  out.push([
    f[col.Name].replace(/_/g, ' '),
    ja,
    type,
    ...pos,
    Number(r50.toPrecision(4)),
    Number(Number(f[col.rtpc]).toPrecision(4)) || null,
    Number(f[col.N]),
    Number(f[col.logAge50]) || null,
  ]);
}
writeFileSync(
  join(root, 'public/data/clusters.json'),
  JSON.stringify({
    source: 'Hunt & Reffert (2023), A&A 673, A114 (VizieR J/A+A/673/A114, Harvard mirror)',
    fields: 'name, nameJa, type(o: open, g: globular), x, y, z (pc, EQJ), r50 (pc), rt (pc), N (members), logAge',
    clusters: out,
  }),
);
console.log(`星団 ${out.length}（散開 ${out.filter((c) => c[2] === 'o').length}・球状 ${out.filter((c) => c[2] === 'g').length}）。外したもの:`, skipped);
