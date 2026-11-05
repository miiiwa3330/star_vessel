// 星雲の一覧 public/data/nebulae.json を作る。使い方：npm run nebulae
// 距離：SIMBAD の距離の測定値の表（mesDistance）の中央値。CDS の本家は開発の環境から応答が無いので、ハーバード大学のミラーから取る。
// 大きさ：SIMBAD の見かけの大きさ。無ければ OpenNGC（CC BY-SA 4.0）。決まりは docs/tech/nebulae.md。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'tools/.cache/nebulae');
mkdirSync(cacheDir, { recursive: true });
const TAP = 'https://simbad.cfa.harvard.edu/simbad/sim-tap/sync';
const OPENNGC_COMMIT = 'master';
const OPENNGC = `https://raw.githubusercontent.com/mattiaverga/OpenNGC/${OPENNGC_COMMIT}/database_files/NGC.csv`;

/** SIMBAD の分類 → この一覧の種類。hii 電離水素領域、pn 惑星状星雲、snr 超新星残骸、rn 反射星雲、dn 暗黒星雲。星形成領域（SFR）は多くが光らない分子雲なので暗黒星雲にする */
const TYPES = { HII: 'hii', EmO: 'hii', GNe: 'hii', ISM: 'hii', PN: 'pn', SNR: 'snr', RNe: 'rn', DNe: 'dn', Cld: 'dn', SFR: 'dn' };
/**
 * よく知られた星雲。SIMBAD で別の分類（星団など）になっているものも星雲として入れる。ngc は OpenNGC の名前（大きさを引く）。
 * distFrom は、距離の測定値が無いときに同じ領域の天体（星雲を光らせている星団・星、同じ銀河など）の距離を使う。
 * distPc は SIMBAD に距離の測定値が無いものを論文から書いた値：はくちょう座ループ 735 pc（Fesen ほか 2018）、ほ座超新星残骸 287 pc（Dodson ほか 2003）。
 * sizeArcmin は Green の超新星残骸の一覧（Green 2019）の大きさ
 */
const FAMOUS = [
  { id: 'M 1', ja: 'かに星雲', type: 'snr', ngc: 'NGC1952' },
  { id: 'M 8', ja: '干潟星雲', type: 'hii', ngc: 'NGC6523' },
  { id: 'M 16', ja: 'わし星雲', type: 'hii', ngc: 'NGC6611' },
  { id: 'M 17', ja: 'オメガ星雲', type: 'hii', ngc: 'NGC6618' },
  { id: 'M 20', ja: '三裂星雲', type: 'hii', ngc: 'NGC6514' },
  { id: 'M 27', ja: 'あれい星雲', type: 'pn', ngc: 'NGC6853' },
  { id: 'M 42', ja: 'オリオン大星雲', type: 'hii', ngc: 'NGC1976' },
  { id: 'M 43', ja: 'M43', type: 'hii', ngc: 'NGC1982', distFrom: 'M 42' },
  { id: 'M 57', ja: '環状星雲', type: 'pn', ngc: 'NGC6720' },
  { id: 'M 76', ja: '小あれい星雲', type: 'pn', ngc: 'NGC0650' },
  { id: 'M 78', ja: 'M78', type: 'rn', ngc: 'NGC2068', distFrom: 'M 42' },
  { id: 'M 97', ja: 'ふくろう星雲', type: 'pn', ngc: 'NGC3587' },
  { id: 'NGC 7000', ja: '北アメリカ星雲', type: 'hii', ngc: 'NGC7000' },
  { id: 'NGC 2237', ja: 'ばら星雲', type: 'hii', ngc: 'NGC2237', distFrom: 'NGC 2244' },
  { id: 'NGC 3372', ja: 'りゅうこつ座大星雲', type: 'hii', ngc: 'NGC3372' },
  { id: 'NGC 6543', ja: 'キャッツアイ星雲', type: 'pn', ngc: 'NGC6543' },
  { id: 'NGC 7293', ja: 'らせん星雲', type: 'pn', ngc: 'NGC7293' },
  { id: 'SNR G074.0-08.5', ja: '網状星雲（はくちょう座ループ）', type: 'snr', distPc: 735, sizeArcmin: 230 },
  { id: 'NGC 1499', ja: 'カリフォルニア星雲', type: 'hii', ngc: 'NGC1499', distFrom: 'HD  24912' },
  { id: 'NGC 2070', ja: 'タランチュラ星雲', type: 'hii', ngc: 'NGC2070', distFrom: 'NAME LMC' },
  { id: 'IC 434', ja: '馬頭星雲', type: 'dn', ngc: 'IC0434', distFrom: 'M 42' },
  { id: 'IC 443', ja: 'くらげ星雲', type: 'snr', ngc: 'IC0443' },
  { id: 'NGC 7635', ja: 'バブル星雲', type: 'hii', ngc: 'NGC7635' },
  { id: 'NGC 281', ja: 'パックマン星雲', type: 'hii', ngc: 'NGC0281' },
  { id: 'SNR G111.7-02.1', ja: 'カシオペヤ座A', type: 'snr', sizeArcmin: 5 },
  { id: 'SNR G263.9-03.3', ja: 'ほ座超新星残骸', type: 'snr', distPc: 287, sizeArcmin: 255 },
];
/** 大きさの分からない星雲の半径（pc）。種類ごとの典型的なおおよその値で、観測の値ではない */
const DEFAULT_RADIUS_PC = { hii: 5, pn: 0.25, snr: 15, rn: 1, dn: 3 };

async function tap(name, adql) {
  const file = join(cacheDir, `${name}.tsv`);
  if (!existsSync(file)) {
    console.log(`取得中: ${name}`);
    const res = await fetch(TAP, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ request: 'doQuery', lang: 'adql', format: 'tsv', maxrec: '200000', query: adql }),
    });
    if (!res.ok) throw new Error(`取得に失敗: ${res.status} ${await res.text()}`);
    writeFileSync(file, await res.text());
  }
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const head = lines[0].split('\t').map((s) => s.replace(/"/g, '').trim());
  return lines.slice(1).map((l) => Object.fromEntries(l.split('\t').map((v, i) => [head[i], v.replace(/"/g, '').trim()])));
}
const toPc = (d) => {
  const v = Number(d.dist);
  const u = d.unit.toLowerCase();
  if (!(v > 0)) return null;
  return u === 'pc' ? v : u === 'kpc' ? v * 1e3 : u === 'mpc' ? v * 1e6 : null;
};
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const COLS = 'b.oid, b.main_id, b.otype, b.ra, b.dec, b.galdim_majaxis, b.galdim_minaxis, d.dist, d.unit';
const list = Object.keys(TYPES).map((t) => `'${t}'`).join(',');
const rows = await tap('by-type', `SELECT ${COLS} FROM basic b JOIN mesDistance d ON d.oidref = b.oid WHERE b.otype IN (${list})`);
// SIMBAD の名前の形（M 42 は "M  42"）に合わせず、ident の id は問い合わせの形のまま探せる形にする
const famousIds = [...new Set(FAMOUS.flatMap((f) => [f.id, f.distFrom].filter(Boolean)))];
const quoted = famousIds.flatMap((id) => {
  const m = /^(M|NGC|IC)\s+(\d+)$/.exec(id);
  if (!m) return [`'${id}'`];
  const width = m[1] === 'M' ? 3 : 4;
  return [`'${m[1]} ${m[2].padStart(width + (m[1] === 'NGC' ? 1 : 0), ' ').trimStart().padStart(width, ' ')}'`, `'${id}'`, `'${m[1]}${' '.repeat(Math.max(1, width + 1 + (m[1] === 'NGC' ? 1 : 0) - m[2].length - m[1].length + 1))}${m[2]}'`];
});
const famousBasics = await tap(
  'famous-basic',
  `SELECT i.id, b.oid, b.main_id, b.otype, b.ra, b.dec, b.galdim_majaxis, b.galdim_minaxis FROM ident i JOIN basic b ON i.oidref = b.oid WHERE i.id IN (${[...new Set(quoted)].join(',')})`,
);
const normId = (s) => s.replace(/\s+/g, ' ').trim();
const basicById = new Map(famousBasics.map((r) => [normId(r.id), r]));
const oids = [...new Set(famousBasics.map((r) => r.oid))];
const famousDist = oids.length ? await tap('famous-dist', `SELECT oidref, dist, unit FROM mesDistance WHERE oidref IN (${oids.join(',')})`) : [];
const distByOid = new Map();
for (const d of famousDist) {
  const pc = toPc(d);
  if (pc === null) continue;
  if (!distByOid.has(d.oidref)) distByOid.set(d.oidref, []);
  distByOid.get(d.oidref).push(pc);
}

// OpenNGC：大きさ（分角）
const ngcFile = join(cacheDir, 'NGC.csv');
if (!existsSync(ngcFile)) {
  const res = await fetch(OPENNGC);
  if (!res.ok) throw new Error(`取得に失敗: ${res.status}`);
  writeFileSync(ngcFile, await res.text());
}
const ngcLines = readFileSync(ngcFile, 'utf8').split('\n');
const ngcHead = ngcLines[0].split(';');
const nI = Object.fromEntries(['Name', 'MajAx', 'MinAx'].map((k) => [k, ngcHead.indexOf(k)]));
const openNgc = new Map();
for (const l of ngcLines.slice(1)) {
  const f = l.split(';');
  if (f[nI.MajAx]) openNgc.set(f[nI.Name], { maj: Number(f[nI.MajAx]), min: Number(f[nI.MinAx]) || Number(f[nI.MajAx]) });
}

const DEG = Math.PI / 180;
const xyz = (ra, dec, d) => [Math.cos(dec * DEG) * Math.cos(ra * DEG), Math.cos(dec * DEG) * Math.sin(ra * DEG), Math.sin(dec * DEG)].map((v) => Number((v * d).toPrecision(7)));
const out = new Map();
const missing = [];
for (const f of FAMOUS) {
  const b = basicById.get(normId(f.id));
  if (!b) {
    missing.push(`${f.id}: SIMBAD に無い`);
    continue;
  }
  let ds = f.distPc ? [f.distPc] : distByOid.get(b.oid);
  if (f.distFrom && (!ds || ds.length === 0)) ds = distByOid.get(basicById.get(normId(f.distFrom))?.oid);
  if (!ds || ds.length === 0) {
    missing.push(`${f.id}: 距離が無い`);
    continue;
  }
  const dist = median(ds);
  const sizeArcmin = f.sizeArcmin ?? ((f.ngc && openNgc.get(f.ngc)?.maj) || Number(b.galdim_majaxis) || null);
  const radius = sizeArcmin ? ((sizeArcmin / 2 / 60) * DEG * dist) : DEFAULT_RADIUS_PC[f.type];
  out.set(b.oid, [b.main_id.replace(/\s+/g, ' '), f.ja, f.type, ...xyz(Number(b.ra), Number(b.dec), dist), Number(radius.toPrecision(3)), sizeArcmin ? 1 : 0]);
}
const grouped = new Map();
for (const r of rows) {
  const pc = toPc(r);
  if (pc === null) continue;
  const g = grouped.get(r.oid) ?? { r, ds: [] };
  g.ds.push(pc);
  grouped.set(r.oid, g);
}
const sized = { measured: 0, typical: 0 };
for (const [oid, g] of grouped) {
  if (out.has(oid)) continue;
  const type = TYPES[g.r.otype];
  const dist = median(g.ds);
  const maj = Number(g.r.galdim_majaxis);
  const radius = maj > 0 ? (maj / 2 / 60) * DEG * dist : DEFAULT_RADIUS_PC[type];
  sized[maj > 0 ? 'measured' : 'typical']++;
  out.set(oid, [g.r.main_id.replace(/\s+/g, ' '), null, type, ...xyz(Number(g.r.ra), Number(g.r.dec), dist), Number(radius.toPrecision(3)), maj > 0 ? 1 : 0]);
}
const data = [...out.values()].sort((a, b) => a[0].localeCompare(b[0]));
writeFileSync(
  join(root, 'public/data/nebulae.json'),
  JSON.stringify({
    source: `SIMBAD (CDS) mesDistance, OpenNGC (CC BY-SA 4.0) (取得 ${new Date().toISOString().slice(0, 10)})`,
    fields: 'name, nameJa, type (hii, pn, snr, rn, dn), x, y, z (pc, EQJ), radius (pc), radiusMeasured (1: from the catalog size, 0: typical value)',
    nebulae: data,
  }),
);
const count = {};
for (const d of data) count[d[2]] = (count[d[2]] ?? 0) + 1;
console.log(`星雲 ${data.length}`, count, sized, '名前付きで入らなかったもの:', missing);
for (const f of data.filter((x) => x[1])) console.log(f[1], f[0], Math.round(Math.hypot(f[3], f[4], f[5])), 'pc r=', f[6], f[7] ? '' : '(typical)');
