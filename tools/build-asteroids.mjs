// JPL Small-Body Database から、番号の付いた小惑星（準惑星・太陽系外縁天体を含む）のデータを作る。
// 使い方：npm run asteroids（NODE_USE_ENV_PROXY=1 が要る環境もある）。形式と決め方は docs/tech/small-bodies.md。
//
// 書き出すもの
// - public/data/asteroids-0.bin …：すべての小惑星の軌道（光の点として描く）。明るい順。
//   0 番は H < 15 の明るいもの（スマホはこれだけ読む）、残りは 1 ファイル 10 MB 以下に分ける
// - public/data/asteroids-large.json：大きな天体（直径 200 km 以上、または直径が分からず H ≤ 3）。球として描き、住所も付く
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'tools/.cache/asteroids');
mkdirSync(cacheDir, { recursive: true });
const API = 'https://ssd-api.jpl.nasa.gov/sbdb_query.api';
const FIELDS = ['pdes', 'name', 'H', 'diameter', 'a', 'e', 'i', 'om', 'w', 'ma', 'epoch'];
const PAGE = 100_000;
const STRIDE = 9;
const BRIGHT_H = 15;
const CHUNK_BYTES = 10 * 1024 * 1024;
const LARGE_DIAMETER_KM = 200;
const LARGE_H_WITHOUT_DIAMETER = 3;
/** 直径が分からない大きな天体の、仮の反射率（太陽系外縁の大きな天体の値はばらつくので、中くらいの 0.3） */
const ASSUMED_ALBEDO_TNO = 0.3;
/** 直径の観測値（SBDB に無いもの）。値と出典は docs/tech/small-bodies.md */
const MEASURED_DIAMETER_KM = {
  136199: 2326, // エリス（Sicardy ほか 2011、恒星の掩蔽）
  136472: 1430, // マケマケ（Brown 2013）
};
const NAMES_JA = {
  1: 'ケレス',
  2: 'パラス',
  3: 'ジュノー',
  4: 'ベスタ',
  10: 'ヒギエア',
  16: 'プシケ',
  52: 'エウロパ（小惑星）',
  624: 'ヘクトル',
  704: 'インターアムニア',
  10199: 'カリクロー',
  20000: 'ヴァルナ',
  50000: 'クワオアー',
  90377: 'セドナ',
  90482: 'オルクス',
  136108: 'ハウメア',
  136199: 'エリス',
  136472: 'マケマケ',
  225088: 'ゴンゴン',
};

async function page(from) {
  const file = join(cacheDir, `page-${from}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const url = `${API}?fields=${FIELDS.join(',')}&sb-kind=a&sb-ns=n&full-prec=1&limit=${PAGE}&limit-from=${from}`;
  console.log(`取得中: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`取得に失敗: ${res.status}`);
  const text = await res.text();
  writeFileSync(file, text);
  return JSON.parse(text);
}

const DEG = Math.PI / 180;
const rows = [];
let total = Infinity;
for (let from = 0; from < total; from += PAGE) {
  const d = await page(from);
  total = Number(d.count);
  if (!d.data?.length) break;
  rows.push(...d.data);
}
const idx = Object.fromEntries(FIELDS.map((f, i) => [f, i]));

const points = [];
const large = [];
let skipped = 0;
for (const r of rows) {
  const number = Number(r[idx.pdes]);
  const H = r[idx.H] === null ? null : Number(r[idx.H]);
  const el = ['a', 'e', 'i', 'om', 'w', 'ma', 'epoch'].map((k) => Number(r[idx[k]]));
  if (!Number.isInteger(number) || H === null || el.some((v) => !Number.isFinite(v)) || el[1] >= 1) {
    skipped++;
    continue;
  }
  if (number === 134340) continue; // 冥王星は太陽系の主な天体として別に持つ
  const [a, e, i, om, w, ma, epoch] = el;
  points.push([number, H, a, e, i * DEG, om * DEG, w * DEG, ma * DEG, epoch - 2451545.0]);
  const diameter = r[idx.diameter] === null ? null : Number(r[idx.diameter]);
  const measured = MEASURED_DIAMETER_KM[number];
  if ((diameter !== null && diameter >= LARGE_DIAMETER_KM) || (diameter === null && H <= LARGE_H_WITHOUT_DIAMETER)) {
    const d = measured ?? diameter ?? (1329 / Math.sqrt(ASSUMED_ALBEDO_TNO)) * 10 ** (-H / 5);
    large.push({
      number,
      name: r[idx.name] ?? null,
      nameJa: NAMES_JA[number] ?? null,
      H,
      diameterKm: Number(d.toPrecision(4)),
      diameterSource: measured ? 'measured' : diameter !== null ? 'sbdb' : 'estimated-from-H',
      a,
      e,
      iDeg: i,
      nodeDeg: om,
      periDeg: w,
      meanAnomalyDeg: ma,
      epochJd: epoch,
    });
  }
}
points.sort((x, y) => x[1] - y[1]);

const files = [];
let start = 0;
const bright = points.findIndex((p) => p[1] >= BRIGHT_H);
const perChunk = Math.floor(CHUNK_BYTES / (STRIDE * 4));
const bounds = [0, bright < 0 ? points.length : bright];
while (bounds[bounds.length - 1] < points.length) bounds.push(Math.min(points.length, bounds[bounds.length - 1] + perChunk));
for (let k = 0; k + 1 < bounds.length; k++) {
  const slice = points.slice(bounds[k], bounds[k + 1]);
  const buf = new Float32Array(slice.length * STRIDE);
  slice.forEach((p, j) => buf.set(p, j * STRIDE));
  const name = `asteroids-${k}.bin`;
  writeFileSync(join(root, 'public/data', name), Buffer.from(buf.buffer));
  files.push({ name, count: slice.length, maxH: slice[slice.length - 1][1] });
  start = bounds[k + 1];
}
large.sort((x, y) => x.number - y.number);
writeFileSync(
  join(root, 'public/data/asteroids-large.json'),
  JSON.stringify({
    source: `NASA/JPL Small-Body Database Query API ${API} (取得 ${new Date().toISOString().slice(0, 10)})`,
    stride: STRIDE,
    fields: 'number, H, a(AU), e, i(rad), node(rad), periapsis(rad), M(rad), epoch(JD−2451545.0)。黄道座標（J2000）',
    files,
    large,
  }),
);
console.log(`小惑星 ${points.length}（外したもの ${skipped}）、大きな天体 ${large.length}。ファイル:`, files);
