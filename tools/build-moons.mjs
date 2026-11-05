// JPL の衛星のデータから、ブラウザで読む public/data/moons.json を作る。使い方：npm run moons
// 形式と決め方は docs/tech/small-bodies.md。
//
// - 軌道：JPL Planetary Satellite Mean Elements（https://ssd.jpl.nasa.gov/sats/elem/）
// - 半径・GM：JPL Planetary Satellite Physical Parameters（https://ssd.jpl.nasa.gov/sats/phys_par/）。
//   載っていない衛星は Horizons（https://ssd.jpl.nasa.gov/api/horizons.api）の半径、無ければ絶対等級から推定
// - 正式な番号を持つ衛星は JPL の 3 桁の id（惑星の番号 × 100 ＋ 衛星の番号）、仮符号の衛星は 5 桁の id（要件 F20）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'tools/.cache/moons');
mkdirSync(join(cacheDir, 'horizons'), { recursive: true });
const ELEM_URL = 'https://ssd.jpl.nasa.gov/sats/elem/';
const PHYS_URL = 'https://ssd.jpl.nasa.gov/sats/phys_par/';
const HORIZONS = (code) =>
  `https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='${code}'&OBJ_DATA='YES'&MAKE_EPHEM='NO'`;
/**
 * 軌道の向きと位置は、Horizons の接触軌道要素（惑星の中心から、ICRF の赤道を基準にした面）を使う。
 * 平均軌道要素の表の角度は、土星・天王星の衛星で Horizons の位置と最大 170 度ずれ、こちらでは正しく読み解けなかったため
 * （docs/devlog/entries/2026-11-05-ships-and-small-bodies.md）。周期だけは平均軌道要素の表の値（長い期間の平均の速さ）を使う
 */
const ELEMENTS_EPOCH = '2026-11-01';
const ELEMENTS = (code, planet, epoch = ELEMENTS_EPOCH) =>
  'https://ssd.jpl.nasa.gov/api/horizons.api?format=text&' +
  new URLSearchParams({
    COMMAND: `'${code}'`,
    EPHEM_TYPE: "'ELEMENTS'",
    CENTER: `'500@${planet}99'`,
    START_TIME: `'${epoch}'`,
    STOP_TIME: `'${epoch} 00:01'`,
    STEP_SIZE: "'1'",
    REF_PLANE: "'FRAME'",
    REF_SYSTEM: "'ICRF'",
    OUT_UNITS: "'KM-S'",
    CSV_FORMAT: "'YES'",
  }).toString();

/** Horizons の接触軌道要素（離心率・傾斜角・昇交点・近点引数・平均近点角・軌道長半径。元期は ELEMENTS_EPOCH） */
async function osculating(code, planet) {
  let epoch = ELEMENTS_EPOCH;
  let text = await cached(`horizons/el-${code}.txt`, ELEMENTS(code, planet));
  // 軌道が分かっている期間が元期より前で終わる衛星（探査機の観測だけで決まった小さな衛星など）は、その最後の日の要素を使う
  const until = /No ephemeris for target .* after A\.D\. (\d{4})-([A-Z]{3})-(\d{2})/.exec(text);
  if (until) {
    const month = 'JANFEBMARAPRMAYJUNJULAUGSEPOCTNOVDEC'.indexOf(until[2]) / 3;
    const d = new Date(Date.UTC(Number(until[1]), month, Number(until[3])) - 86_400_000);
    epoch = d.toISOString().slice(0, 10);
    text = await cached(`horizons/el-${code}-${epoch}.txt`, ELEMENTS(code, planet, epoch));
  }
  const body = text.split('$$SOE')[1]?.split('$$EOE')[0]?.trim();
  if (!body) throw new Error(`接触軌道要素が取れない: ${code}`);
  const f = body.split('\n')[0].split(',').map((v) => v.trim());
  // JDTDB, 日付, EC, QR, IN, OM, W, Tp, N, MA, TA, A, AD, PR
  return { epoch: `${epoch}.0`, e: Number(f[2]), i: Number(f[4]), node: Number(f[5]), w: Number(f[6]), M: Number(f[9]), a: Number(f[11]) };
}
/** 半径が分からない衛星の反射率（幾何アルベド）。不規則衛星は暗いものが多いので 0.04 とする（docs/tech/small-bodies.md） */
const ASSUMED_ALBEDO = 0.04;
/** 半径も明るさも分からない衛星の、仮の半径（km）。見つかったばかりの小さな不規則衛星（数 km 以下）なので */
const UNKNOWN_RADIUS_KM = 1.5;

async function cached(name, url) {
  const file = join(cacheDir, name);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  console.log(`取得中: ${url}`);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      const text = await res.text();
      writeFileSync(file, text);
      return text;
    }
    if (attempt >= 4) throw new Error(`取得に失敗: ${res.status} ${url}`);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
}

const unescape = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;| /g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&omega;/g, 'ω')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
function table(html, id) {
  const start = html.indexOf(`id="${id}"`);
  if (start < 0) throw new Error(`表が無い: ${id}`);
  const body = html.slice(start, html.indexOf('</table>', start));
  return [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((r) =>
    [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => unescape(c[1])),
  );
}
const num = (s) => {
  const m = /-?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/.exec(s ?? '');
  return m ? Number(m[0]) : null;
};

const elemRows = table(await cached('elem.html', ELEM_URL), 'sat_elem');
const physRows = table(await cached('phys.html', PHYS_URL), 'sat_phys_par');
const header = elemRows[0];
const col = (name) => {
  const i = header.findIndex((h) => h.startsWith(name));
  if (i < 0) throw new Error(`列が無い: ${name}`);
  return i;
};
const C = {
  planet: col('Planet'),
  name: col('Satellite'),
  code: col('Code'),
  frame: col('Frame'),
  epoch: col('Epoch'),
  a: col('a('),
  e: col('e'),
  w: col('ω'),
  M: col('M('),
  i: col('i('),
  node: col('node'),
  P: col('P(days)'),
  Papsis: col('Papsis'),
  Pnode: col('Pnode'),
  ra: col('R.A.'),
  dec: col('Dec.'),
};

// 物理量の表：Planet, Satellite, Code, GM, Mean Radius, Mean Density（値・誤差・出典が 1 つのセルにまとまっている）
const phys = new Map();
for (const r of physRows) {
  if (r.length < 6 || !/^\d{3}$/.test(r[2])) continue;
  phys.set(r[2], { gm: num(r[3]), radius: num(r[4]) });
}

async function horizonsRadius(code) {
  const text = await cached(`horizons/${code}.txt`, HORIZONS(code));
  const r =
    /Mean radius[^=]*=\s*([0-9.]+)/i.exec(text) ??
    /Radius[^=]*=\s*([0-9.]+)/i.exec(text) ??
    /RAD=\s*([0-9.]+)/.exec(text);
  if (r) return { radius: Number(r[1]), source: 'horizons-radius' };
  const h = /V\(1,0\)\s*=\s*([-+]?[0-9.]+)/.exec(text) ?? /\bH=\s*([-+]?[0-9.]+)/.exec(text);
  if (h) {
    // D = 1329 km / √p × 10^(−H/5)
    const d = (1329 / Math.sqrt(ASSUMED_ALBEDO)) * 10 ** (-Number(h[1]) / 5);
    return { radius: d / 2, source: 'estimated-from-H' };
  }
  return null;
}

const out = [];
const skipped = { other: 0, duplicate: 0, meanElements: 0 };
const sources = {};
for (const r of elemRows.slice(1)) {
  if (r.length < header.length) continue;
  const code = r[C.code];
  // 正式な番号の無い衛星（仮符号。Horizons の番号は 5 桁：惑星の番号＋数字）も入れる。住所の衛星の番号は 0 にする（要件 F20。docs/tech/small-bodies.md）
  const provisional = /^[3-9]\d{4}$/.test(code);
  if (!provisional && !/^[3-9]\d{2}$/.test(code)) {
    skipped.other++;
    continue;
  }
  // 表に同じ衛星が 2 回出ることがある（2026-11-05 にパック〈715〉が 2 行あった）。最初の行だけを使う
  if (out.some((x) => x.code === code)) {
    skipped.duplicate++;
    continue;
  }
  const p = phys.get(code);
  let radius = p?.radius ?? null;
  let source = radius !== null ? 'jpl-phys' : null;
  if (radius === null) {
    const h = await horizonsRadius(code);
    if (h) ({ radius, source } = h);
    await new Promise((res) => setTimeout(res, 150));
  }
  if (radius === null) {
    radius = UNKNOWN_RADIUS_KM;
    source = 'unknown';
  }
  sources[source] = (sources[source] ?? 0) + 1;
  let o = await osculating(code, code[0]);
  // 見つかったばかりの衛星は、その時刻の接触軌道が楕円にならないことがある（2026-11-05：S/2023 S 38 と S/2025 U 1）。
  // そのときは、平均軌道要素の表の値を使う（向きの基準が違うので、軌道の面の向きは正しくない。docs/tech/small-bodies.md）
  if (!(o.e < 1 && o.a > 0)) {
    console.log(`接触軌道要素が楕円でないので、平均軌道要素を使う: ${r[C.name]} (e=${o.e})`);
    skipped.meanElements++;
    o = { epoch: `${ELEMENTS_EPOCH}.0`, e: num(r[C.e]), i: num(r[C.i]), node: num(r[C.node]), w: num(r[C.w]), M: num(r[C.M]), a: num(r[C.a]) };
  }
  out.push({
    code,
    planet: Number(code[0]),
    number: provisional ? 0 : Number(code.slice(1)),
    name: r[C.name],
    frame: 'icrf',
    ...o,
    P: num(r[C.P]),
    radius: Number(radius.toPrecision(4)),
    gm: p?.gm ?? null,
    sizeSource: source,
  });
}
out.sort((a, b) => a.planet - b.planet || a.number - b.number || a.code.localeCompare(b.code));
writeFileSync(
  join(root, 'public/data/moons.json'),
  JSON.stringify({
    source: `NASA/JPL Solar System Dynamics: ${ELEM_URL} , ${PHYS_URL} , Horizons (取得 ${new Date().toISOString().slice(0, 10)})`,
    moons: out,
  }),
);
console.log(`衛星 ${out.length}。大きさの出どころ:`, sources, '外したもの:', skipped);
