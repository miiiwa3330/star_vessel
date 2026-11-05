// Gaia DR3 の星 public/data/stars-gaia-*.bin を作る。使い方：npm run gaia（先に npm run stars・exoplanets・compact）
// 取り方：GAVO（ハイデルベルク大学）の TAP（https://dc.g-vo.org/tap）。
// 選び方・変換の決まりは docs/tech/gaia-stars.md。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'tools/.cache/gaia');
mkdirSync(cacheDir, { recursive: true });
const TAP = 'https://dc.g-vo.org/tap/sync';
/**
 * 1. Gaia Catalogue of Nearby Stars（GCNS。Gaia Collaboration, Smart ほか 2021）：100 pc 以内の 33 万個
 * 2. Gaia DR3（1,000 pc 以内で G 11 等より明るい星。視差の精度 5σ・RUWE < 1.4）。明るさの幅ごとに分けて取る
 * GAVO の Gaia の表は明るさで速く引ける（ESA の本家と ARI は全天を調べるのが遅く、待ち行列から動かなかった）
 */
const QUERIES = {
  gcns: 'SELECT source_id, ra, dec, parallax, pmra, pmdec, adoptedrv AS radial_velocity, phot_g_mean_mag, phot_bp_mean_mag, phot_rp_mean_mag, dist_50 FROM gcns.main',
};
const G_BINS = [[-2, 6], [6, 7], [7, 8], [8, 8.5], [8.5, 9], [9, 9.5], [9.5, 10], [10, 10.25], [10.25, 10.5], [10.5, 10.75], [10.75, 11]];
for (const [lo, hi] of G_BINS) {
  QUERIES[`g${lo}`] = `SELECT source_id, ra, dec, parallax, pmra, pmdec, radial_velocity, phot_g_mean_mag, phot_bp_mean_mag, phot_rp_mean_mag FROM gaia.dr3lite WHERE phot_g_mean_mag >= ${lo} AND phot_g_mean_mag < ${hi} AND parallax > 1 AND parallax > 5 * parallax_error AND ruwe < 1.4`;
}
/** 位置を合わせる年。Gaia DR3 の元期は 2016.0 */
const TARGET_EPOCH = 2027.0;
const GAIA_EPOCH = 2016.0;
/** ID の土台。stars.bin の id（HYG は 12 万未満）と重ならないように。32bit 小数で正確に持てる範囲に収める */
const GAIA_ID_BASE = 1_000_000;
/** 1 つのファイルの星の数（Cloudflare の静的なファイルの上限 25 MiB に収める。1 個 24 バイト） */
const STARS_PER_FILE = 800_000;
/** HYG などの星と同じ星とみなす方向のずれ（秒角）と、明るさの差（等） */
const SAME_STAR_ARCSEC = 8;
const SAME_STAR_MAG = 2.5;

async function fetchPart(name, adql) {
  const file = join(cacheDir, `${name}.csv`);
  if (existsSync(file)) return file;
  // 大きな応答は途中で接続が切れることがあるので、何度か取り直す
  for (let attempt = 0; ; attempt++) {
    try {
      console.log(`取得中: ${name}`);
      const res = await fetch(TAP, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ REQUEST: 'doQuery', LANG: 'ADQL', FORMAT: 'csv', MAXREC: '3000000', QUERY: adql }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const text = await res.text();
      if (!text.startsWith('source_id')) throw new Error(text.slice(0, 300));
      writeFileSync(file, text);
      return file;
    } catch (e) {
      if (attempt >= 4) throw new Error(`取得に失敗: ${name} ${e}`);
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    }
  }
}

const seen = new Set();
const rows = [];
const num = (s) => (s === undefined || s === '' ? Number.NaN : Number(s));
for (const [name, adql] of Object.entries(QUERIES)) {
  const lines = readFileSync(await fetchPart(name, adql), 'utf8').split('\n').filter(Boolean);
  const head = lines[0].split(',').map((h) => h.trim());
  const I = Object.fromEntries(head.map((h, i) => [h, i]));
  let n = 0;
  for (const l of lines.slice(1)) {
    const f = l.split(',');
    const id = f[I.source_id];
    if (seen.has(id)) continue;
    seen.add(id);
    const plx = num(f[I.parallax]);
    const bp = num(f[I.phot_bp_mean_mag]);
    const rp = num(f[I.phot_rp_mean_mag]);
    // GCNS は視差からの距離の推定（dist_50。kpc）がある
    const distPc = I.dist_50 !== undefined ? num(f[I.dist_50]) * 1000 : 1000 / plx;
    rows.push({
      id,
      ra: num(f[I.ra]),
      dec: num(f[I.dec]),
      distPc,
      pmra: num(f[I.pmra]) || 0,
      pmdec: num(f[I.pmdec]) || 0,
      rv: num(f[I.radial_velocity]) || 0,
      g: num(f[I.phot_g_mean_mag]),
      c: bp - rp,
    });
    n++;
  }
  console.log(`${name}: ${lines.length - 1} 行、新しい星 ${n}`);
}
const DEG = Math.PI / 180;
const MAS_YR_TO_KMS = 4.740470;
const PC_PER_YEAR_PER_KMS = 1 / 977_792.2;
// source_id の順に番号を振る。同じ取得結果なら同じ番号（恒星系の記号）になる
rows.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));

// ── 同じ星を外す：HYG・実在の系外惑星のデータの恒星・白色矮星 ──
const CELL = 0.05; // 度
const key = (ra, dec) => `${Math.floor(ra / CELL)},${Math.floor((dec + 90) / CELL)}`;
const known = new Map();
const addKnown = (x, y, z, mag) => {
  const d = Math.hypot(x, y, z);
  if (!(d > 0)) return;
  const dec = Math.asin(z / d) / DEG;
  let ra = Math.atan2(y, x) / DEG;
  if (ra < 0) ra += 360;
  const k = key(ra, dec);
  if (!known.has(k)) known.set(k, []);
  known.get(k).push({ ra, dec, mag });
};
const bin = readFileSync(join(root, 'public/data/stars.bin'));
const s = new Float32Array(bin.buffer, bin.byteOffset, bin.length / 4);
const mb = readFileSync(join(root, 'public/data/stars-motion.bin'));
const m = new Float32Array(mb.buffer, mb.byteOffset, mb.length / 4);
const YEARS = GAIA_EPOCH - 2000;
for (let i = 0; i < s.length / 6; i++) {
  const x = s[i * 6] + m[i * 3] * YEARS;
  const y = s[i * 6 + 1] + m[i * 3 + 1] * YEARS;
  const z = s[i * 6 + 2] + m[i * 3 + 2] * YEARS;
  addKnown(x, y, z, s[i * 6 + 3] + 5 * Math.log10(Math.hypot(x, y, z) / 10));
}
const exo = JSON.parse(readFileSync(join(root, 'public/data/exoplanets.json'), 'utf8'));
for (const sys of exo.systems) if (sys.pos) addKnown(sys.pos[0], sys.pos[1], sys.pos[2], sys.absMag + 5 * Math.log10(Math.hypot(...sys.pos) / 10));
const compact = JSON.parse(readFileSync(join(root, 'public/data/compact.json'), 'utf8'));
for (const w of compact.whiteDwarfs) addKnown(w[2], w[3], w[4], null);
function isKnown(r) {
  const cosDec = Math.max(0.01, Math.cos(r.dec * DEG));
  const span = SAME_STAR_ARCSEC / 3600;
  const steps = Math.ceil(span / cosDec / CELL);
  for (let i = -steps; i <= steps; i++) {
    for (let j = -1; j <= 1; j++) {
      const list = known.get(key((r.ra + i * CELL + 360) % 360, r.dec + j * CELL));
      if (!list) continue;
      for (const k of list) {
        const dra = Math.abs(k.ra - r.ra);
        const da = Math.min(dra, 360 - dra) * cosDec;
        const dd = k.dec - r.dec;
        if (da * da + dd * dd > span * span) continue;
        if (k.mag === null || Math.abs(k.mag - r.g) < SAME_STAR_MAG) return true;
      }
    }
  }
  return false;
}

const out = [];
let removed = 0;
rows.forEach((r, index) => {
  if (isKnown(r)) {
    removed++;
    return;
  }
  const dist = r.distPc;
  if (!(dist > 0) || !Number.isFinite(r.g)) return;
  const a = r.ra * DEG;
  const d = r.dec * DEG;
  const dir = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  const east = [-Math.sin(a), Math.cos(a), 0];
  const north = [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)];
  const vt = MAS_YR_TO_KMS * dist / 1000;
  const yrs = TARGET_EPOCH - GAIA_EPOCH;
  const pos = [0, 1, 2].map((k) => {
    const v = (r.rv * dir[k] + vt * r.pmra * east[k] + vt * r.pmdec * north[k]) * PC_PER_YEAR_PER_KMS;
    return dir[k] * dist + v * yrs;
  });
  // G → V（Riello ほか 2021 の変換式）、BP−RP → B−V（見た目のための近似）
  const c = Number.isFinite(r.c) ? r.c : 0.8;
  const gMinusV = -0.02704 + 0.01424 * c - 0.2156 * c * c + 0.01426 * c * c * c;
  const absV = r.g - gMinusV - 5 * Math.log10(dist / 10);
  const bv = Number.isFinite(r.c) ? Math.min(2, 0.79 * r.c) : Number.NaN;
  out.push([pos[0], pos[1], pos[2], absV, bv, GAIA_ID_BASE + index]);
});
out.sort((a, b) => a[3] - b[3]);
const files = [];
for (let i = 0; i < out.length; i += STARS_PER_FILE) {
  const part = out.slice(i, i + STARS_PER_FILE);
  const data = new Float32Array(part.length * 6);
  part.forEach((p, j) => data.set(p, j * 6));
  const name = `stars-gaia-${files.length}.bin`;
  writeFileSync(join(root, 'public/data', name), Buffer.from(data.buffer));
  files.push({ name, count: part.length });
}
writeFileSync(
  join(root, 'public/data/stars-gaia.json'),
  JSON.stringify({
    source: `ESA Gaia DR3 and GCNS via GAVO TAP (取得 ${new Date().toISOString().slice(0, 10)}). Positions moved to ${TARGET_EPOCH}.`,
    idBase: GAIA_ID_BASE,
    files,
  }),
);
writeFileSync(
  join(root, 'public/data/stars-gaia.LICENSE.txt'),
  [
    'stars-gaia-*.bin は ESA Gaia DR3 を変換したデータです。',
    'This work has made use of data from the European Space Agency (ESA) mission Gaia (https://www.cosmos.esa.int/gaia), processed by the Gaia Data Processing and Analysis Consortium (DPAC, https://www.cosmos.esa.int/web/gaia/dpac/consortium).',
    'Gaia data license: https://www.cosmos.esa.int/web/gaia-users/license (CC BY-SA 3.0 IGO).',
    '',
  ].join('\n'),
);
console.log(`Gaia ${rows.length} 個。HYG などと同じ星として外した ${removed} 個。残り ${out.length} 個（${files.length} ファイル）`);
