// 天の川銀河の外の銀河の一覧 public/data/galaxies.json を作る。使い方：npm run galaxies
// 出どころ：Karachentsev ほか (2013), AJ 145, 101「Updated Nearby Galaxy Catalog」（VizieR J/AJ/145/101）。約 1 万 1 千万光年までの銀河。
// 長軸の向き：OpenNGC（CC BY-SA 4.0）。決まりは docs/tech/galaxies.md。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'tools/.cache/galaxies');
mkdirSync(cacheDir, { recursive: true });
const URL_UNGC =
  'https://vizier.cfa.harvard.edu/viz-bin/asu-tsv?-source=J/AJ/145/101/catalog&-out=Name,RAJ2000,DEJ2000,a26,b/a,Bmag,TT,Mcl,Dist,i,BMag&-out.max=2000';
const OPENNGC = 'https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/NGC.csv';
const JA = {
  MESSIER031: 'アンドロメダ銀河',
  MESSIER033: 'さんかく座銀河',
  LMC: '大マゼラン雲',
  SMC: '小マゼラン雲',
  MESSIER081: 'ボーデの銀河',
  MESSIER082: '葉巻銀河',
  NGC5194: '子持ち銀河',
  MESSIER101: '回転花火銀河',
  NGC4594: 'ソンブレロ銀河',
  NGC5236: '南の回転花火銀河',
  NGC0253: 'ちょうこくしつ座銀河',
  NGC5128: 'ケンタウルス座A',
};
async function cached(name, url) {
  const file = join(cacheDir, name);
  if (!existsSync(file)) {
    console.log(`取得中: ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`取得に失敗: ${res.status}`);
    writeFileSync(file, await res.text());
  }
  return readFileSync(file, 'utf8');
}
const lines = (await cached('ungc.tsv', URL_UNGC)).split('\n').filter((l) => l && !l.startsWith('#'));
const head = lines[0].split('\t').map((s) => s.trim());
const rows = lines.slice(3).map((l) => Object.fromEntries(l.split('\t').map((v, i) => [head[i], v.trim()])));

const ngcLines = (await cached('NGC.csv', OPENNGC)).split('\n');
const ngcHead = ngcLines[0].split(';');
const nI = Object.fromEntries(['Name', 'PosAng', 'M'].map((k) => [k, ngcHead.indexOf(k)]));
const posAng = new Map();
for (const l of ngcLines.slice(1)) {
  const f = l.split(';');
  if (f[nI.PosAng] === undefined || f[nI.PosAng] === '') continue;
  posAng.set(f[nI.Name], Number(f[nI.PosAng]));
  if (f[nI.M]) posAng.set(`MESSIER${f[nI.M]}`, Number(f[nI.PosAng]));
}
const DEG = Math.PI / 180;
const sexa = (s, hours) => {
  const m = /^([-+]?)(\d+)\s+(\d+)\s+([\d.]+)$/.exec(s);
  if (!m) throw new Error(`座標の形が分からない: ${s}`);
  const v = Number(m[2]) + Number(m[3]) / 60 + Number(m[4]) / 3600;
  return (m[1] === '-' ? -1 : 1) * v * (hours ? 15 : 1);
};
const out = [];
const skipped = { milkyWay: 0, noMag: 0 };
let withPa = 0;
for (const r of rows) {
  if (!r.Dist) continue;
  const distPc = Number(r.Dist) * 1e6;
  // 天の川銀河そのものは入れない（銀河のモデルで描く）
  if (/^Milky/i.test(r.Name) || distPc < 2e4) {
    skipped.milkyWay++;
    continue;
  }
  const ra = sexa(r.RAJ2000, true);
  const dec = sexa(r.DEJ2000, false);
  const v = [Math.cos(dec * DEG) * Math.cos(ra * DEG), Math.cos(dec * DEG) * Math.sin(ra * DEG), Math.sin(dec * DEG)];
  const a26 = Number(r.a26) || null;
  const absB = r.BMag === '' ? null : Number(r.BMag);
  if (absB === null) {
    skipped.noMag++;
    continue;
  }
  const pa = posAng.get(r.Name);
  if (pa !== undefined) withPa++;
  out.push([
    r.Name,
    JA[r.Name] ?? null,
    ...v.map((x) => Number((x * distPc).toPrecision(7))),
    a26,
    r['b/a'] === '' ? null : Number(r['b/a']),
    r.i === '' ? null : Number(r.i),
    pa ?? null,
    r.TT === '' ? null : Number(r.TT),
    absB,
  ]);
}
out.sort((a, b) => a[10] - b[10]);
writeFileSync(
  join(root, 'public/data/galaxies.json'),
  JSON.stringify({
    source: 'Karachentsev et al. 2013, AJ 145, 101 (Updated Nearby Galaxy Catalog, VizieR J/AJ/145/101); position angles from OpenNGC (CC BY-SA 4.0)',
    fields: 'name, nameJa, x, y, z (pc, EQJ), a26 (arcmin), b/a, inclination (deg), position angle (deg), T type, absolute B magnitude',
    galaxies: out,
  }),
);
console.log(`銀河 ${out.length}。長軸の向きが分かる ${withPa}。外したもの:`, skipped);
console.log(out.slice(0, 14).map((g) => `${g[0]} ${g[1] ?? ''} ${(Math.hypot(g[2], g[3], g[4]) / 1e6).toFixed(2)} Mpc a=${g[5]}' T=${g[9]} MB=${g[10]} PA=${g[8]}`).join('\n'));
for (const k of Object.keys(JA)) if (!out.some((g) => g[0] === k)) console.log('名前が見つからない:', k);
