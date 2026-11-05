// 彗星の一覧 public/data/comets.json を作る。使い方：npm run comets
// 出どころ：NASA/JPL Small-Body Database Query API。決まりは docs/tech/small-bodies.md の「彗星」。
// 消滅した彗星（D）と行方不明の彗星（X）は外す。いまは無いので
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIELDS = ['full_name', 'pdes', 'prefix', 'name', 'e', 'q', 'i', 'om', 'w', 'tp', 'diameter', 'M1', 'K1'];
const url = `https://ssd-api.jpl.nasa.gov/sbdb_query.api?fields=${FIELDS.join(',')}&sb-kind=c&full-prec=1`;
console.log(`取得中: ${url}`);
const res = await fetch(url);
if (!res.ok) throw new Error(`取得に失敗: ${res.status}`);
const json = await res.json();
const ix = Object.fromEntries(json.fields.map((f, i) => [f, i]));
const JD_UNIX = 2440587.5;
const seen = new Set();
const rows = [];
const skipped = { lost: 0, noOrbit: 0, duplicate: 0 };
for (const r of json.data) {
  const prefix = r[ix.prefix] ?? '';
  if (prefix === 'D' || prefix === 'X') {
    skipped.lost++;
    continue;
  }
  const n = (k) => (r[ix[k]] === null || r[ix[k]] === '' ? null : Number(r[ix[k]]));
  const e = n('e');
  const q = n('q');
  const tp = n('tp');
  if (e === null || q === null || tp === null || n('i') === null) {
    skipped.noOrbit++;
    continue;
  }
  // 記号：C＋プレフィックス＋仮符号の英数字（番号付きは C1P のように番号と P のまま）。住所の区切りの - や空白を消す
  const pdes = String(r[ix.pdes]);
  const compact = pdes.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  const code = /^[0-9]+[A-Z]/.test(pdes) ? `C${compact}` : `C${prefix}${compact}`;
  if (seen.has(code)) {
    skipped.duplicate++;
    continue;
  }
  seen.add(code);
  rows.push([
    code,
    String(r[ix.full_name]).trim(),
    Number(e.toPrecision(10)),
    Number(q.toPrecision(10)),
    Number(n('i').toFixed(5)),
    Number(n('om').toFixed(5)),
    Number(n('w').toFixed(5)),
    // 近日点を通る時刻（UNIX 日）
    Number((tp - JD_UNIX).toFixed(5)),
    n('diameter'),
    n('M1'),
    n('K1'),
  ]);
}
// 恒星間天体（1I/オウムアムア・2I/ボリソフ・3I/アトラス）は、この問い合わせには入らないので 1 つずつ取る
for (const pdes of ['1I', '2I', '3I']) {
  const r = await fetch(`https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${pdes}&full-prec=1`);
  if (!r.ok) throw new Error(`取得に失敗: ${pdes} ${r.status}`);
  const d = await r.json();
  const el = Object.fromEntries(d.orbit.elements.map((e) => [e.name, Number(e.value)]));
  // 2I・3I は C/2019 Q4・C/2025 N1 として一覧にも入っているので、同じ軌道の行を置き換える
  const same = rows.findIndex((x) => Math.abs(x[3] - el.q) < 1e-5 && Math.abs(x[2] - el.e) < 1e-5);
  if (same >= 0) rows.splice(same, 1);
  rows.push([
    `C${pdes}`,
    d.object.fullname.trim(),
    Number(el.e.toPrecision(10)),
    Number(el.q.toPrecision(10)),
    Number(el.i.toFixed(5)),
    Number(el.om.toFixed(5)),
    Number(el.w.toFixed(5)),
    Number((el.tp - JD_UNIX).toFixed(5)),
    null,
    null,
    null,
  ]);
}
writeFileSync(
  join(root, 'public/data/comets.json'),
  JSON.stringify({
    source: `NASA/JPL Small-Body Database Query API (取得 ${new Date().toISOString().slice(0, 10)})`,
    fields: 'code, name, e, q (AU), i, node, peri (deg, J2000 ecliptic), tp (unix days), diameter (km), M1, K1',
    comets: rows,
  }),
);
console.log(`彗星 ${rows.length}。外したもの:`, skipped);
