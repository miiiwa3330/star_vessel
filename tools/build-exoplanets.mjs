// Open Exoplanet Catalogue（MIT）から、ブラウザで読む系外惑星のデータ public/data/exoplanets.json を作る。
// 形式と決め方は docs/tech/exoplanets.md。使い方：npm run exoplanets
//
// - 確定した惑星（<list>Confirmed planets</list>）だけを使う
// - 恒星は、星のデータ（public/data/stars.bin。先に npm run stars で作る）の中から、方向と距離が合う星を探す。
//   見つかればその星の恒星系（H＋HYG の id）、見つからなければ新しい恒星（E＋名前のハッシュ）として足す
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'tools/.cache');
const repoDir = join(cacheDir, 'open_exoplanet_catalogue');
const REPO_URL = 'https://github.com/OpenExoplanetCatalogue/open_exoplanet_catalogue.git';
const STRIDE = 6;
/** 星のデータの星と同じ恒星とみなす、方向のずれの上限（度）と、距離の比の範囲 */
const MATCH_MAX_DEG = 0.03;
const MATCH_DIST_RATIO = [0.6, 1.6];

function fetchRepo() {
  if (!existsSync(repoDir)) {
    mkdirSync(cacheDir, { recursive: true });
    console.log(`取得中: ${REPO_URL}`);
    execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse', REPO_URL, repoDir], { stdio: 'inherit' });
    execFileSync('git', ['-C', repoDir, 'sparse-checkout', 'set', 'systems'], { stdio: 'inherit' });
  } else {
    execFileSync('git', ['-C', repoDir, 'pull', '--ff-only', '-q'], { stdio: 'inherit' });
  }
  const commit = execFileSync('git', ['-C', repoDir, 'log', '-1', '--format=%H %cs']).toString().trim();
  return commit;
}

// ── とても小さな XML の読み方（OEC の XML は属性に値を持たず、入れ子のタグだけなので、これで足りる） ──
function parseXml(text) {
  const rootNode = { tag: '#root', children: [], text: '' };
  const stack = [rootNode];
  const re = /<(\/?)([A-Za-z_][\w-]*)([^>]*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[5] !== undefined) {
      stack[stack.length - 1].text += m[5];
      continue;
    }
    const [, close, tag, , selfClose] = m;
    if (close) {
      stack.pop();
    } else {
      const node = { tag, children: [], text: '' };
      stack[stack.length - 1].children.push(node);
      if (!selfClose) stack.push(node);
    }
  }
  return rootNode;
}
const kids = (n, tag) => n.children.filter((c) => c.tag === tag);
const kid = (n, tag) => n.children.find((c) => c.tag === tag);
const num = (n, tag) => {
  const c = kid(n, tag);
  if (!c) return null;
  const v = Number(c.text.trim());
  return c.text.trim() !== '' && Number.isFinite(v) ? v : null;
};
const str = (n, tag) => kid(n, tag)?.text.trim() ?? null;
/** n の下（入れ子をたどって）にある tag をすべて */
function deep(n, tag, out = []) {
  for (const c of n.children) {
    if (c.tag === tag) out.push(c);
    else deep(c, tag, out);
  }
  return out;
}

const DEG = Math.PI / 180;
function sexagesimal(s, hours) {
  if (!s) return null;
  const parts = s.trim().split(/\s+/);
  const sign = parts[0].startsWith('-') ? -1 : 1;
  const [a, b = 0, c = 0] = parts.map((p) => Math.abs(Number(p)));
  if (![a, b, c].every(Number.isFinite)) return null;
  return sign * (a + b / 60 + c / 3600) * (hours ? 15 : 1);
}

/** 有効温度（K）から色指数 B−V（Ballesteros 2012 の式を逆に解く） */
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

/** 名前から 36 進 7 桁のハッシュ（FNV-1a 32bit） */
function nameHash(s) {
  let h = 0x811c9dc5;
  for (const ch of Buffer.from(s, 'utf8')) {
    h ^= ch;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).toUpperCase().padStart(7, '0');
}

const round = (v, digits) => (v === null ? null : Number(v.toPrecision(digits)));

// ── 星のデータ ──
const starsPath = join(root, 'public/data/stars.bin');
if (!existsSync(starsPath)) throw new Error('public/data/stars.bin が無い。先に npm run stars');
const starsBuf = readFileSync(starsPath);
const stars = new Float32Array(starsBuf.buffer, starsBuf.byteOffset, starsBuf.byteLength / 4);
const starCount = stars.length / STRIDE;
const starDir = new Float64Array(starCount * 3);
const starDist = new Float64Array(starCount);
for (let i = 0; i < starCount; i++) {
  const x = stars[i * STRIDE];
  const y = stars[i * STRIDE + 1];
  const z = stars[i * STRIDE + 2];
  const d = Math.hypot(x, y, z);
  starDist[i] = d;
  starDir[i * 3] = x / d;
  starDir[i * 3 + 1] = y / d;
  starDir[i * 3 + 2] = z / d;
}
// ── 名前での照合（HYG の CSV があれば）。連星の中の星（プロキシマ・ケンタウリなど）を正しく当てるため ──
// HYG の CSV は npm run stars が tools/.cache/ に置く（または同じ場所に置く）
const hygCsv = join(cacheDir, 'hyg_v44.csv.gz');
const inStarsBin = new Set();
for (let i = 0; i < starCount; i++) inStarsBin.add(stars[i * STRIDE + 5]);
/** 正規化した名前（例：HIP 70890、HD 209458、HR 5459、GL 551、PROXIMA CENTAURI）→ HYG の id */
const byName = new Map();
const normalizeName = (raw) => {
  const n = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  const m = /^(HIP|HD|HR|GJ|GL|GLIESE)\s*([0-9]+(?:\.[0-9]+)?)\s*([A-Z])?$/.exec(n);
  if (!m) return n;
  const cat = m[1] === 'GJ' || m[1] === 'GLIESE' ? 'GL' : m[1];
  return `${cat} ${m[2]}${m[3] ?? ''}`;
};
if (existsSync(hygCsv)) {
  const lines = gunzipSync(readFileSync(hygCsv)).toString('utf8').split('\n');
  const header = lines[0].split(',').map((h) => h.replace(/"/g, ''));
  const col = Object.fromEntries(['id', 'hip', 'hd', 'hr', 'gl', 'proper'].map((k) => [k, header.indexOf(k)]));
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const f = line.split(',').map((v) => v.replace(/"/g, ''));
    const id = Number(f[col.id]);
    if (!inStarsBin.has(id)) continue;
    const add = (name) => name && !byName.has(normalizeName(name)) && byName.set(normalizeName(name), id);
    if (f[col.hip]) add(`HIP ${f[col.hip]}`);
    if (f[col.hd]) add(`HD ${f[col.hd]}`);
    if (f[col.hr]) add(`HR ${f[col.hr]}`);
    if (f[col.gl]) add(f[col.gl]);
    if (f[col.proper]) add(f[col.proper]);
  }
  console.log(`名前での照合：HYG の名前 ${byName.size} 個`);
} else {
  console.log('HYG の CSV が無いので、名前では照合しない（方向と距離だけ）');
}
const matchByName = (names) => {
  for (const n of names) {
    const id = byName.get(normalizeName(n));
    if (id !== undefined) return id;
  }
  return null;
};

const cosMax = Math.cos(MATCH_MAX_DEG * DEG);
function matchStar(dir, dist) {
  let best = -1;
  let bestDot = cosMax;
  for (let i = 0; i < starCount; i++) {
    const dot = dir[0] * starDir[i * 3] + dir[1] * starDir[i * 3 + 1] + dir[2] * starDir[i * 3 + 2];
    if (dot <= bestDot) continue;
    const r = starDist[i] / dist;
    if (r < MATCH_DIST_RATIO[0] || r > MATCH_DIST_RATIO[1]) continue;
    best = i;
    bestDot = dot;
  }
  return best;
}

// ── 変換 ──
const commit = fetchRepo();
const files = readdirSync(join(repoDir, 'systems')).filter((f) => f.endsWith('.xml'));
const out = [];
const usedCodes = new Map();
const skipped = { notConfirmed: 0, noDistance: 0, noOrbit: 0, solarSystem: 0 };
let matched = 0;
let matchedByName = 0;

for (const file of files) {
  const sys = kid(parseXml(readFileSync(join(repoDir, 'systems', file), 'utf8')), 'system');
  if (!sys) continue;
  const sysName = str(sys, 'name');
  const planetsXml = deep(sys, 'planet');
  const confirmed = planetsXml.filter((p) => kids(p, 'list').some((l) => l.text.trim() === 'Confirmed planets'));
  if (planetsXml.some((p) => kids(p, 'list').some((l) => l.text.trim() === 'Solar System'))) {
    skipped.solarSystem += planetsXml.length;
    continue;
  }
  skipped.notConfirmed += planetsXml.length - confirmed.length;
  if (confirmed.length === 0) continue;
  // 恒星：惑星を持つ最初の星（連星は 1 つの恒星にまとめる。docs/tech/exoplanets.md）
  const host = deep(sys, 'star').find((s) => deep(s, 'planet').length > 0) ?? deep(sys, 'star')[0];
  // 位置は、恒星が自分の座標を持っていればそれを、無ければ系の座標を使う
  const ra = sexagesimal((host && str(host, 'rightascension')) ?? str(sys, 'rightascension'), true);
  const dec = sexagesimal((host && str(host, 'declination')) ?? str(sys, 'declination'), false);
  const dist = (host && num(host, 'distance')) ?? num(sys, 'distance');
  if (ra === null || dec === null || dist === null || dist <= 0) {
    skipped.noDistance += confirmed.length;
    continue;
  }
  const starMass = host ? num(host, 'mass') : null;
  const starRadius = host ? num(host, 'radius') : null;
  const teff = host ? num(host, 'temperature') : null;
  const magV = host ? num(host, 'magV') : null;

  const dir = [Math.cos(dec * DEG) * Math.cos(ra * DEG), Math.cos(dec * DEG) * Math.sin(ra * DEG), Math.sin(dec * DEG)];
  // まず恒星の名前（HIP・HD・HR・Gliese の番号、固有名）で探し、無ければ方向と距離で探す
  const hostNames = host ? kids(host, 'name').map((n) => n.text) : [];
  const byNameId = matchByName(hostNames);
  const hit = byNameId === null ? matchStar(dir, dist) : -1;
  let code;
  const entry = { name: sysName };
  if (byNameId !== null) {
    code = `H${byNameId}`;
    matched++;
    matchedByName++;
  } else if (hit >= 0) {
    code = `H${stars[hit * STRIDE + 5]}`;
    matched++;
  } else {
    code = `E${nameHash(sysName)}`;
    let absMag;
    if (magV !== null) absMag = magV - 5 * Math.log10(dist / 10);
    else if (teff !== null && starRadius !== null) absMag = 4.74 - 2.5 * Math.log10(starRadius ** 2 * (teff / 5772) ** 4);
    else absMag = 10;
    entry.pos = dir.map((v) => round(v * dist, 7));
    entry.absMag = round(absMag, 4);
    entry.bv = round(teff !== null ? bvFromTeff(teff) : 0.65, 3);
  }
  if (usedCodes.has(code)) {
    // 同じ恒星に 2 つの系（XML のファイル）が当たったら、惑星をまとめる
    const prev = usedCodes.get(code);
    prev.planetsRaw.push(...confirmed);
    continue;
  }
  entry.code = code;
  entry.star = { mass: round(starMass, 4), radius: round(starRadius, 4), teff: round(teff, 5) };
  entry.planetsRaw = confirmed;
  usedCodes.set(code, entry);
  out.push(entry);
}

const DAY_S = 86400;
const GM_SUN = 1.3271244e11; // km³/s²（IAU 2015）
const KM_PER_AU = 149597870.7;
let planetCount = 0;
for (const entry of out) {
  const massSun = entry.star.mass ?? 1;
  const planets = [];
  for (const p of entry.planetsRaw) {
    let a = num(p, 'semimajoraxis');
    let period = num(p, 'period');
    if (a === null && period === null) {
      skipped.noOrbit++;
      continue;
    }
    // 片方しか無ければ、ケプラーの第 3 法則で補う
    if (a === null) a = Math.cbrt((GM_SUN * massSun * (period * DAY_S) ** 2) / (4 * Math.PI ** 2)) / KM_PER_AU;
    if (period === null) period = (2 * Math.PI * Math.sqrt((a * KM_PER_AU) ** 3 / (GM_SUN * massSun))) / DAY_S;
    planets.push([
      str(p, 'name'),
      round(a, 6),
      round(period, 8),
      round(num(p, 'eccentricity'), 4),
      round(num(p, 'inclination'), 5),
      round(num(p, 'ascendingnode'), 5),
      round(num(p, 'periastron'), 5),
      num(p, 'transittime'),
      round(num(p, 'radius'), 4),
      round(num(p, 'mass'), 4),
      round(num(p, 'temperature'), 4),
    ]);
  }
  planets.sort((x, y) => x[1] - y[1]);
  entry.planets = planets;
  planetCount += planets.length;
  delete entry.planetsRaw;
}
const systems = out.filter((e) => e.planets.length > 0).sort((a, b) => (a.code < b.code ? -1 : 1));

const doc = {
  source: `Open Exoplanet Catalogue ${REPO_URL} (commit ${commit})`,
  fields: 'planets: [name, a(AU), period(day), e, i(deg), node(deg), periastron(deg), transittime(JD), radius(RJ), mass(MJ), temperature(K)]',
  systems,
};
writeFileSync(join(root, 'public/data/exoplanets.json'), JSON.stringify(doc));
// MIT の条件（著作権の表示と許諾の文を、すべての複製に含める）のため、配布元の README の License の節をそのまま添える
const readme = readFileSync(join(repoDir, 'README.md'), 'utf8');
const license = readme.slice(readme.indexOf('License\n'));
writeFileSync(
  join(root, 'public/data/exoplanets.LICENSE.txt'),
  `exoplanets.json は Open Exoplanet Catalogue を変換したデータです。\n` +
    `This data is derived from the Open Exoplanet Catalogue, ${REPO_URL} (commit ${commit}).\n` +
    `Changes: kept only confirmed planets and the fields listed in "fields"; matched host stars to the HYG-based stars.bin.\n\n` +
    license,
);
console.log(
  `恒星系 ${systems.length}（星のデータと一致 ${matched}〈うち名前で ${matchedByName}〉・新しい恒星 ${systems.length - matched}）、惑星 ${planetCount}。外したもの:`,
  skipped,
);
