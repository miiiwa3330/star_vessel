// 星座の線の一覧 public/data/constellations.json を作る。使い方：npm run constellations（先に npm run stars）
// 線の出どころ：d3-celestial（Olaf Frohn、BSD 3-Clause）の constellations.lines.json。日本語の名前も同じ配布の constellations.json。
// 線の端は赤経・赤緯なので、いちばん近い星のデータ（HYG）の星に置き換える。こうすると線の端が本物の 3 次元の位置になり、
// 地球から見ると星座の形に、ほかの場所から見ると崩れた形に見える。決まりは docs/tech/constellations.md。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'tools/.cache/constellations');
mkdirSync(cacheDir, { recursive: true });
const COMMIT = '7e720a3de062059d4c5400a379146a601d9010e0';
const base = `https://raw.githubusercontent.com/ofrohn/d3-celestial/${COMMIT}`;
/** 線の端と星の方向のずれの上限（度）。これより離れていたら、その線を描かない */
const MATCH_MAX_DEG = 0.5;
/** 線の端の候補にする星の明るさの限り（見かけの等級）。暗い星に当たらないように */
const MATCH_MAX_MAG = 9;

async function cached(name, path) {
  const file = join(cacheDir, name);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  console.log(`取得中: ${base}${path}`);
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`取得に失敗: ${res.status}`);
  const text = await res.text();
  writeFileSync(file, text);
  return text;
}
const lines = JSON.parse(await cached('lines.json', '/data/constellations.lines.json'));
const names = JSON.parse(await cached('names.json', '/data/constellations.json'));
const license = await cached('LICENSE', '/LICENSE');

// 星のデータにある星（距離の分かる星）だけを候補にする
const bin = readFileSync(join(root, 'public/data/stars.bin'));
const floats = new Float32Array(bin.buffer, bin.byteOffset, bin.length / 4);
const inBin = new Set();
for (let o = 0; o < floats.length; o += 6) inBin.add(floats[o + 5]);
const csv = gunzipSync(readFileSync(join(root, 'tools/.cache/hyg_v44.csv.gz'))).toString('utf8').split('\n');
const header = csv[0].split(',').map((h) => h.replace(/"/g, ''));
const c = Object.fromEntries(['id', 'ra', 'dec', 'mag', 'proper'].map((k) => [k, header.indexOf(k)]));
const DEG = Math.PI / 180;
const vec = (raDeg, decDeg) => [Math.cos(decDeg * DEG) * Math.cos(raDeg * DEG), Math.cos(decDeg * DEG) * Math.sin(raDeg * DEG), Math.sin(decDeg * DEG)];
const cands = [];
for (const line of csv.slice(1)) {
  if (!line) continue;
  const f = line.split(',').map((v) => v.replace(/"/g, ''));
  const id = Number(f[c.id]);
  const mag = Number(f[c.mag]);
  if (!inBin.has(id) || !(mag <= MATCH_MAX_MAG)) continue;
  cands.push({ id, mag, proper: f[c.proper], v: vec(Number(f[c.ra]) * 15, Number(f[c.dec])) });
}
const cosMax = Math.cos(MATCH_MAX_DEG * DEG);
const cacheMatch = new Map();
let worst = 0;
const unmatched = [];
function match(lon, lat) {
  const k = `${lon},${lat}`;
  if (cacheMatch.has(k)) return cacheMatch.get(k);
  const v = vec(lon, lat);
  let best = null;
  let bestDot = cosMax;
  for (const s of cands) {
    const d = v[0] * s.v[0] + v[1] * s.v[1] + v[2] * s.v[2];
    if (d > bestDot) {
      bestDot = d;
      best = s;
    }
  }
  if (!best) {
    unmatched.push([lon, lat]);
    cacheMatch.set(k, null);
    return null;
  }
  worst = Math.max(worst, Math.acos(Math.min(1, bestDot)) / DEG);
  cacheMatch.set(k, best.id);
  return best.id;
}

const nameOf = new Map(names.features.map((f) => [f.id, f.properties]));
const out = [];
let segments = 0;
for (const f of lines.features) {
  const p = nameOf.get(f.id);
  if (!p) throw new Error(`名前が無い: ${f.id}`);
  const seen = new Set();
  const pairs = [];
  for (const poly of f.geometry.coordinates) {
    for (let i = 0; i + 1 < poly.length; i++) {
      const a = match(poly[i][0], poly[i][1]);
      const b = match(poly[i + 1][0], poly[i + 1][1]);
      // 距離の分からない星（星のデータに無い星）が端の線は、3 次元の場所に置けないので描かない
      if (a === null || b === null || a === b) continue;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([a, b]);
    }
  }
  segments += pairs.length;
  out.push({ id: f.id, nameJa: p.ja, nameEn: p.en, lines: pairs });
}
out.sort((a, b) => a.id.localeCompare(b.id));
const data = join(root, 'public/data');
writeFileSync(
  join(data, 'constellations.json'),
  JSON.stringify({ source: `d3-celestial ${COMMIT} (BSD 3-Clause, Olaf Frohn). Line ends replaced with HYG v4.4 star ids.`, constellations: out }),
);
writeFileSync(join(data, 'constellations.LICENSE.txt'), `constellations.json は d3-celestial の星座の線と名前を変換したデータです。\nhttps://github.com/ofrohn/d3-celestial\n\n${license}`);
console.log(`星座 ${out.length}、線 ${segments} 本、線の端の星 ${cacheMatch.size} 個。方向のずれの最大 ${worst.toFixed(3)} 度。見つからない端: ${JSON.stringify(unmatched)}`);
