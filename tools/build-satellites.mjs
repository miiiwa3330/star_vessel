// 人工衛星の軌道要素（TLE）の写し public/data/satellites.json を作る。使い方：npm run satellites
// ふだんはサーバーの /api/satellites が SatNOGS から最新のものを取ってくる。これは取れなかったときに使う写し（古くなる）。
// 形と決め方は docs/tech/satellites.md
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'https://db.satnogs.org/api/tle/?format=json';
console.log(`取得中: ${URL}`);
const res = await fetch(URL);
if (!res.ok) throw new Error(`取得に失敗: ${res.status}`);
const raw = await res.json();
// src/world/satellite-data.ts の fromSatnogs と同じ確かめ方
const satellites = raw
  .filter(
    (r) =>
      Number.isInteger(r.norad_cat_id) &&
      r.norad_cat_id > 0 &&
      typeof r.tle1 === 'string' &&
      typeof r.tle2 === 'string' &&
      r.tle1.startsWith('1 ') &&
      r.tle2.startsWith('2 ') &&
      r.tle1.length === 69 &&
      r.tle2.length === 69 &&
      // 宇宙ステーションに結合している部品は外す（本体と同じ場所にいるので）
      !/^(ISS|CSS) \((?!ZARYA|TIANHE)/.test(String(r.tle0 ?? '').replace(/^0 /, '')),
  )
  .map((r) => ({ id: r.norad_cat_id, name: String(r.tle0 ?? r.norad_cat_id).replace(/^0 /, '').trim().slice(0, 40), l1: r.tle1, l2: r.tle2 }))
  .sort((a, b) => a.id - b.id);
writeFileSync(
  join(root, 'public/data/satellites.json'),
  JSON.stringify({ source: 'SatNOGS DB (CC BY-SA 4.0)', fetchedAt: new Date().toISOString(), satellites }),
);
console.log(`衛星 ${satellites.length}`);
