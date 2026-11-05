// 系外惑星のデータ public/data/exoplanets.json に、NASA Exoplanet Archive にだけある確定した惑星を足す。
// npm run exoplanets が build-exoplanets.mjs のあとに動かす。決まりは docs/tech/exoplanets.md。
// Open Exoplanet Catalogue の更新は NASA より遅く、確定した惑星が千個ほど少ないため。NASA Exoplanet Archive のデータは公開（クレジット表記を求められる）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'tools/.cache');
mkdirSync(cacheDir, { recursive: true });
const COLS = 'pl_name,hostname,hip_name,hd_name,ra,dec,sy_dist,pl_orbper,pl_orbsmax,pl_orbeccen,pl_orbincl,pl_orblper,pl_tranmid,pl_radj,pl_bmassj,pl_eqt,st_teff,st_rad,st_mass,sy_vmag';
const URL_NEA = `https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=select+${COLS}+from+pscomppars&format=csv`;
const file = join(cacheDir, 'nasa-exoplanets.csv');
if (!existsSync(file)) {
  console.log(`取得中: ${URL_NEA}`);
  const res = await fetch(URL_NEA);
  if (!res.ok) throw new Error(`取得に失敗: ${res.status}`);
  writeFileSync(file, await res.text());
}
function parseCsv(line) {
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
const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
const head = parseCsv(lines[0]);
const rows = lines.slice(1).map((l) => {
  const f = parseCsv(l);
  return Object.fromEntries(head.map((h, i) => [h, f[i]]));
});

const doc = JSON.parse(readFileSync(join(root, 'public/data/exoplanets.json'), 'utf8'));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const known = new Set(doc.systems.flatMap((s) => s.planets.map((p) => norm(p[0]))));
const systemOfPlanetHost = new Map();
for (const s of doc.systems) systemOfPlanetHost.set(norm(s.name), s);

// HYG の星：HIP・HD の番号と位置
const bin = readFileSync(join(root, 'public/data/stars.bin'));
const stars = new Float32Array(bin.buffer, bin.byteOffset, bin.length / 4);
const inBin = new Set();
const starsById = new Map();
for (let o = 0; o < stars.length; o += 6) {
  inBin.add(stars[o + 5]);
  starsById.set(stars[o + 5], o);
}
const hyg = gunzipSync(readFileSync(join(cacheDir, 'hyg_v44.csv.gz'))).toString('utf8').split('\n');
const hh = hyg[0].split(',').map((h) => h.replace(/"/g, ''));
const cHip = hh.indexOf('hip');
const cHd = hh.indexOf('hd');
const cId = hh.indexOf('id');
const byCat = new Map();
for (const l of hyg.slice(1)) {
  if (!l) continue;
  const f = l.split(',').map((v) => v.replace(/"/g, ''));
  const id = Number(f[cId]);
  if (!inBin.has(id)) continue;
  if (f[cHip]) byCat.set(`HIP ${f[cHip]}`, id);
  if (f[cHd]) byCat.set(`HD ${f[cHd]}`, id);
}
const DEG = Math.PI / 180;
// FNV-1a（build-exoplanets.mjs と同じ。恒星系の記号）
function nameHash(s) {
  let h = 0x811c9dc5;
  for (const ch of Buffer.from(s, 'utf8')) {
    h ^= ch;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).toUpperCase().padStart(7, '0');
}
const round = (v, digits) => (v === null || !Number.isFinite(v) ? null : Number(v.toPrecision(digits)));
const num = (s) => (s === undefined || s === '' ? null : Number(s));
/** 温度から B−V（Ballesteros 2012 の式を二分法で逆に解く。build-exoplanets.mjs と同じ） */
function bvFromTeff(t) {
  const teffOf = (bv) => 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  let lo = -0.4;
  let hi = 2.0;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (teffOf(mid) > t) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
const code2sys = new Map(doc.systems.map((s) => [s.code, s]));
// 同じ恒星を名前で引けないとき（TrES-2 と TrES-2 A など）のために、恒星の方向でも探す
const MATCH_MAX_DEG = 0.03;
const MATCH_DIST_RATIO = [0.6, 1.6];
const cosMax = Math.cos(MATCH_MAX_DEG * DEG);
const sysDirs = [];
const addDir = (sys) => {
  let p = sys.pos;
  if (!p && sys.code.startsWith('H')) {
    const o = starsById.get(Number(sys.code.slice(1)));
    if (o !== undefined) p = [stars[o], stars[o + 1], stars[o + 2]];
  }
  if (!p) return;
  const d = Math.hypot(...p);
  sysDirs.push({ sys, d, v: p.map((x) => x / d) });
};
doc.systems.forEach(addDir);
const nearSystem = (ra, dec, dist) => {
  if (ra === null || dec === null) return null;
  const v = [Math.cos(dec * DEG) * Math.cos(ra * DEG), Math.cos(dec * DEG) * Math.sin(ra * DEG), Math.sin(dec * DEG)];
  let best = null;
  let bestDot = cosMax;
  for (const s of sysDirs) {
    const dot = v[0] * s.v[0] + v[1] * s.v[1] + v[2] * s.v[2];
    if (dot <= bestDot) continue;
    if (dist !== null && (s.d / dist < MATCH_DIST_RATIO[0] || s.d / dist > MATCH_DIST_RATIO[1])) continue;
    best = s.sys;
    bestDot = dot;
  }
  return best;
};
const added = { planets: 0, newStars: 0, onHyg: 0, onExisting: 0, skippedNoOrbit: 0, skippedNoPos: 0, samePeriod: 0 };
const GM_SUN = 1.3271244e11;
const KM_PER_AU = 149597870.7;
for (const r of rows) {
  if (known.has(norm(r.pl_name))) continue;
  const massSun = num(r.st_mass) ?? 1;
  let a = num(r.pl_orbsmax);
  let period = num(r.pl_orbper);
  if (a === null && period === null) {
    added.skippedNoOrbit++;
    continue;
  }
  if (a === null) a = Math.cbrt((GM_SUN * massSun * (period * 86400) ** 2) / (4 * Math.PI ** 2)) / KM_PER_AU;
  if (period === null) period = (2 * Math.PI * Math.sqrt((a * KM_PER_AU) ** 3 / (GM_SUN * massSun))) / 86400;
  const row = [
    r.pl_name,
    round(a, 7),
    round(period, 9),
    round(num(r.pl_orbeccen), 4),
    round(num(r.pl_orbincl), 5),
    null,
    round(num(r.pl_orblper), 5),
    num(r.pl_tranmid),
    round(num(r.pl_radj), 4),
    round(num(r.pl_bmassj), 4),
    round(num(r.pl_eqt), 4),
  ];
  let sys = systemOfPlanetHost.get(norm(r.hostname)) ?? nearSystem(num(r.ra), num(r.dec), num(r.sy_dist));
  // 同じ惑星が別の名前で入っていることがある（KOI の番号と Kepler の番号など）。周期が 1% 以内の惑星があれば足さない
  if (sys && sys.planets.some((p) => Math.abs(p[2] / period - 1) < 0.01)) {
    added.samePeriod++;
    continue;
  }
  if (!sys) {
    const hygId = byCat.get(r.hip_name) ?? byCat.get(r.hd_name);
    if (hygId !== undefined) {
      const code = `H${hygId}`;
      sys = code2sys.get(code);
      if (!sys) {
        sys = { name: r.hostname, code, star: { mass: num(r.st_mass), radius: num(r.st_rad), teff: num(r.st_teff) }, planets: [] };
        doc.systems.push(sys);
        code2sys.set(code, sys);
        addDir(sys);
        added.onHyg++;
      }
    } else {
      const ra = num(r.ra);
      const dec = num(r.dec);
      const dist = num(r.sy_dist);
      if (ra === null || dec === null || dist === null) {
        added.skippedNoPos++;
        continue;
      }
      const dir = [Math.cos(dec * DEG) * Math.cos(ra * DEG), Math.cos(dec * DEG) * Math.sin(ra * DEG), Math.sin(dec * DEG)];
      const teff = num(r.st_teff);
      const vmag = num(r.sy_vmag);
      const radius = num(r.st_rad);
      let absMag = 10;
      if (vmag !== null) absMag = vmag - 5 * Math.log10(dist / 10);
      else if (teff !== null && radius !== null) absMag = 4.74 - 2.5 * Math.log10(radius ** 2 * (teff / 5772) ** 4);
      const code = `E${nameHash(r.hostname)}`;
      sys = {
        name: r.hostname,
        code,
        pos: dir.map((v) => Number((v * dist).toPrecision(7))),
        absMag: Number(absMag.toPrecision(4)),
        bv: Number((teff !== null ? bvFromTeff(teff) : 0.65).toPrecision(3)),
        star: { mass: num(r.st_mass), radius, teff },
        planets: [],
      };
      doc.systems.push(sys);
      code2sys.set(code, sys);
      addDir(sys);
      added.newStars++;
    }
    systemOfPlanetHost.set(norm(r.hostname), sys);
  } else added.onExisting++;
  sys.planets.push(row);
  known.add(norm(r.pl_name));
  added.planets++;
}
for (const s of doc.systems) s.planets.sort((x, y) => x[1] - y[1]);
doc.systems.sort((a, b) => (a.code < b.code ? -1 : 1));
doc.source += `; NASA Exoplanet Archive pscomppars (取得 ${new Date().toISOString().slice(0, 10)})`;
writeFileSync(join(root, 'public/data/exoplanets.json'), JSON.stringify(doc));
console.log('NASA Exoplanet Archive から足した:', added, `合計 恒星系 ${doc.systems.length}・惑星 ${doc.systems.reduce((n, s) => n + s.planets.length, 0)}`);
