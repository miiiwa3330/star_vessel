// 衛星の日本語の名前（要件 F20）を Wikidata（CC0）から取り、public/data/moons.json の各衛星に nameJa として書き込む。
// npm run moons の最後に動く（build-moons.mjs のあと）。
//
// 決め方（docs/tech/small-bodies.md「名前」）：
//   1. Wikidata の日本語のラベルに、かな・漢字があればそれ
//   2. 無ければ、日本語版 Wikipedia の記事の題名（「（衛星）」を除く）に、かな・漢字があればそれ
//   3. どちらも無ければ英語の名前（日本語版 Wikipedia も、新しい衛星の多くは英語の名前のまま）
//   仮符号の衛星（JPL の表で S2010_J_1 のように書かれたもの）は「S/2010 J 1」と書く
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'tools/.cache/moons');
mkdirSync(cacheDir, { recursive: true });
const moonsPath = join(root, 'public/data/moons.json');

/** JPL の表の名前の誤り・切れ（2026-11-05 の表）。正しい名前は IAU の名前（Wikidata の英語のラベルと同じ） */
const JPL_NAME_FIXES = { 519: 'Megaclite', 558: 'Philophrosyne' };
/** 惑星の番号 → Wikidata の項目 */
const PARENTS = { 3: 'Q2', 4: 'Q111', 5: 'Q319', 6: 'Q193', 7: 'Q324', 8: 'Q332', 9: 'Q339' };

const QUERY = `SELECT ?parent ?en ?ja ?jaTitle WHERE {
  VALUES ?parent { ${Object.values(PARENTS).map((q) => `wd:${q}`).join(' ')} }
  ?item wdt:P397 ?parent .
  ?item rdfs:label ?en FILTER(lang(?en) = "en")
  OPTIONAL { ?item rdfs:label ?ja FILTER(lang(?ja) = "ja") }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://ja.wikipedia.org/> ; schema:name ?jaTitle . }
}`;

async function fetchRows() {
  const file = join(cacheDir, 'wikidata-names.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(QUERY)}`;
  const res = await fetch(url, { headers: { accept: 'application/sparql-results+json', 'user-agent': 'star_vessel-build/0.1' } });
  if (!res.ok) throw new Error(`Wikidata: ${res.status}`);
  const json = await res.json();
  const rows = json.results.bindings.map((b) => ({
    parent: b.parent.value.split('/').pop(),
    en: b.en.value,
    ja: b.ja?.value ?? null,
    jaTitle: b.jaTitle?.value ?? null,
  }));
  writeFileSync(file, JSON.stringify(rows));
  return rows;
}

const JAPANESE = /[぀-ヿ一-鿿]/;
const rows = await fetchRows();
const byName = new Map();
for (const r of rows) {
  const key = `${r.parent}|${r.en.toLowerCase()}`;
  const prev = byName.get(key) ?? {};
  const ja = r.ja && JAPANESE.test(r.ja) ? r.ja : null;
  const title = r.jaTitle ? r.jaTitle.replace(/\s*[（(]衛星[)）]$/, '') : null;
  byName.set(key, { ja: prev.ja ?? ja, title: prev.title ?? (title && JAPANESE.test(title) ? title : null) });
}

const data = JSON.parse(readFileSync(moonsPath, 'utf8'));
const seen = new Set();
const counts = { label: 0, title: 0, english: 0, provisional: 0 };
data.moons = data.moons.filter((m) => !seen.has(m.code) && seen.add(m.code));
for (const m of data.moons) {
  m.name = JPL_NAME_FIXES[m.code] ?? m.name;
  const prov = /^S(\d{4})_([A-Z])_(\d+)$/.exec(m.name);
  if (prov) {
    m.nameJa = `S/${prov[1]} ${prov[2]} ${prov[3]}`;
    counts.provisional++;
    continue;
  }
  const hit = byName.get(`${PARENTS[m.planet]}|${m.name.toLowerCase()}`);
  if (hit?.ja) {
    m.nameJa = hit.ja;
    counts.label++;
  } else if (hit?.title) {
    m.nameJa = hit.title;
    counts.title++;
  } else {
    m.nameJa = m.name;
    counts.english++;
  }
}
data.namesSource = `日本語の名前：Wikidata（CC0。取得 ${new Date().toISOString().slice(0, 10)}）`;
writeFileSync(moonsPath, JSON.stringify(data));
console.log(`衛星 ${data.moons.length}。名前の出どころ:`, counts);
