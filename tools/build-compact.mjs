// 白色矮星・パルサー（中性子星）・ブラックホールの一覧 public/data/compact.json を作る。使い方：npm run compact
// 形と決め方・出典は docs/tech/compact-objects.md。
// CDS の本家（vizier.cds.unistra.fr）は開発の環境から応答が無かったので、同じデータのハーバード大学のミラーから取る。
// - 白色矮星：Gentile Fusillo ほか (2021), MNRAS 508, 3877（J/MNRAS/508/3877）。100 pc 以内（視差 > 10 mas）、白色矮星らしさ Pwd > 0.75
// - パルサー：ATNF Pulsar Catalogue（Manchester ほか 2005。VizieR B/psr）。距離（Dist）のあるもの
// - ブラックホール：BlackCAT（Corral-Santana ほか 2016, A&A 587, A61。J/A+A/587/A61）。距離のあるもの
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'tools/.cache');
mkdirSync(cacheDir, { recursive: true });
const MIRROR = 'https://vizier.cfa.harvard.edu/viz-bin/asu-tsv';
const QUERIES = {
  wd: `${MIRROR}?-source=J/MNRAS/508/3877/maincat&-out=WDJname,RA_ICRS,DE_ICRS,Plx,Pwd,TeffH,MassH,GMAG&Plx=%3E10&Pwd=%3E0.75&-out.max=50000`,
  psr: `${MIRROR}?-source=B/psr/psr&-out=PSRJ,RA2000,DE2000,P0,Dist&Dist=%3E0&-out.max=10000`,
  bh: `${MIRROR}?-source=J/A%2BA/587/A61&-out=Name,RAJ2000,DEJ2000,l_Dist,Dist&-out.max=1000`,
};

async function table(key) {
  const file = join(cacheDir, `compact-${key}.tsv`);
  if (!existsSync(file)) {
    console.log(`取得中: ${QUERIES[key]}`);
    const res = await fetch(QUERIES[key]);
    if (!res.ok) throw new Error(`取得に失敗: ${res.status}`);
    writeFileSync(file, await res.text());
  }
  const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  const header = lines[0].split('\t').map((s) => s.trim());
  // 1 行目が列の名前、2 行目が単位、3 行目が区切り線
  return lines.slice(3).map((l) => Object.fromEntries(l.split('\t').map((v, i) => [header[i], v.trim()])));
}

const DEG = Math.PI / 180;
const xyz = (raDeg, decDeg, distPc) =>
  [Math.cos(decDeg * DEG) * Math.cos(raDeg * DEG), Math.cos(decDeg * DEG) * Math.sin(raDeg * DEG), Math.sin(decDeg * DEG)].map(
    (v) => Number((v * distPc).toPrecision(7)),
  );
const sexa = (s, hours) => {
  const p = s.trim().split(/\s+/);
  const sign = p[0].startsWith('-') ? -1 : 1;
  const [a, b = 0, c = 0] = p.map((x) => Math.abs(Number(x)));
  return sign * (a + b / 60 + c / 3600) * (hours ? 15 : 1);
};
/** 名前から 36 進 7 桁のハッシュ（FNV-1a 32bit。系外惑星の E と同じ作り方） */
function nameHash(s) {
  let h = 0x811c9dc5;
  for (const ch of Buffer.from(s, 'utf8')) {
    h ^= ch;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).toUpperCase().padStart(7, '0');
}
const codes = new Set();
const unique = (code) => {
  if (codes.has(code)) return null;
  codes.add(code);
  return code;
};

// 白色矮星
const whiteDwarfs = [];
for (const r of await table('wd')) {
  const plx = Number(r.Plx);
  const absG = Number(r.GMAG);
  if (!(plx > 10) || !Number.isFinite(absG)) continue;
  const code = unique(`W${nameHash(r.WDJname)}`);
  if (!code) continue;
  whiteDwarfs.push([
    code,
    r.WDJname,
    ...xyz(Number(r.RA_ICRS), Number(r.DE_ICRS), 1000 / plx),
    Number(absG.toFixed(2)),
    Number(r.TeffH) || null,
    Number(r.MassH) || null,
  ]);
}

// パルサー。記号は P＋J 名（+ は P、− は M に置き換える。住所の区切り - と重ならないように）
const pulsars = [];
for (const r of await table('psr')) {
  const dist = Number(r.Dist) * 1000;
  if (!(dist > 0)) continue;
  const code = unique(`P${r.PSRJ.replace(/^J/, '').replace(/\+/g, 'P').replace(/-/g, 'M').toUpperCase()}`);
  if (!code || !/^P[0-9A-Z]{1,15}$/.test(code)) continue;
  pulsars.push([code, r.PSRJ, ...xyz(Number(r.RA2000), Number(r.DE2000), dist), Number(r.P0) || null]);
}

// ブラックホール（X 線新星）。距離が上限（<）だけのものも、その値を使う
const blackHoles = [];
for (const r of await table('bh')) {
  const dist = Number(r.Dist) * 1000;
  if (!(dist > 0)) continue;
  const code = unique(`B${nameHash(r.Name)}`);
  if (!code) continue;
  blackHoles.push([code, r.Name, ...xyz(sexa(r.RAJ2000, true), sexa(r.DEJ2000, false), dist)]);
}

writeFileSync(
  join(root, 'public/data/compact.json'),
  JSON.stringify({
    source:
      'Gentile Fusillo et al. (2021) MNRAS 508, 3877; ATNF Pulsar Catalogue (Manchester et al. 2005, VizieR B/psr); BlackCAT (Corral-Santana et al. 2016, A&A 587, A61). VizieR Harvard mirror',
    fields: {
      whiteDwarfs: 'code, name, x, y, z (pc, EQJ), absolute G mag, Teff (K), mass (Msun)',
      pulsars: 'code, name, x, y, z (pc, EQJ), period (s)',
      blackHoles: 'code, name, x, y, z (pc, EQJ)',
    },
    whiteDwarfs,
    pulsars,
    blackHoles,
  }),
);
console.log(`白色矮星 ${whiteDwarfs.length}・パルサー ${pulsars.length}・ブラックホール ${blackHoles.length}`);
