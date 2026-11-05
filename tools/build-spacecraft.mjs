// 太陽系を飛んでいる探査機の位置の表 public/data/spacecraft.json を作る。使い方：npm run spacecraft
// 出どころ：NASA/JPL Horizons。太陽中心・ICRF の位置と速さ（km・km/s）を一定の間隔で取り、描くときはエルミート補間でつなぐ。
// 決まりは docs/tech/spacecraft.md。
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const START = '2026-10-01';
const STOP = '2031-01-01';
/** naif：JPL の番号。step：表の間隔（日）。sizeM：いちばん長いところの大きさ（おおよその値。m） */
const CRAFT = [
  { naif: -31, nameJa: 'ボイジャー1号', step: 30, sizeM: 13 },
  { naif: -32, nameJa: 'ボイジャー2号', step: 30, sizeM: 13 },
  { naif: -23, nameJa: 'パイオニア10号', step: 30, sizeM: 3 },
  { naif: -24, nameJa: 'パイオニア11号', step: 30, sizeM: 3 },
  { naif: -98, nameJa: 'ニュー・ホライズンズ', step: 30, sizeM: 3 },
  { naif: -170, nameJa: 'ジェイムズ・ウェッブ宇宙望遠鏡', step: 5, sizeM: 21 },
  { naif: -680, nameJa: 'ユークリッド', step: 5, sizeM: 5 },
  { naif: -139479, nameJa: 'ガイア', step: 5, sizeM: 10 },
  { naif: -96, nameJa: 'パーカー・ソーラー・プローブ', step: 1, sizeM: 3 },
  { naif: -144, nameJa: 'ソーラー・オービター', step: 5, sizeM: 18 },
  { naif: -49, nameJa: 'ルーシー', step: 5, sizeM: 14 },
  { naif: -255, nameJa: 'サイキ', step: 5, sizeM: 25 },
  { naif: -159, nameJa: 'エウロパ・クリッパー', step: 5, sizeM: 30 },
  { naif: -28, nameJa: 'ジュース（JUICE）', step: 5, sizeM: 27 },
  { naif: -121, nameJa: 'ベピコロンボ', step: 5, sizeM: 30 },
  { naif: -91, nameJa: 'ヘラ', step: 5, sizeM: 11 },
  { naif: -64, nameJa: 'オシリス・アペックス', step: 5, sizeM: 6 },
  { naif: -37, nameJa: 'はやぶさ2', step: 5, sizeM: 6 },
];
const MON = 'JANFEBMARAPRMAYJUNJULAUGSEPOCTNOVDEC';
const q = (naif, start, stop, step) =>
  'https://ssd.jpl.nasa.gov/api/horizons.api?format=text&' +
  new URLSearchParams({
    COMMAND: `'${naif}'`,
    EPHEM_TYPE: "'VECTORS'",
    CENTER: "'500@10'",
    START_TIME: `'${start}'`,
    STOP_TIME: `'${stop}'`,
    STEP_SIZE: `'${step}d'`,
    REF_SYSTEM: "'ICRF'",
    REF_PLANE: "'FRAME'",
    VEC_TABLE: "'2'",
    OUT_UNITS: "'KM-S'",
    CSV_FORMAT: "'YES'",
    OBJ_DATA: "'NO'",
  }).toString();
async function get(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.text();
    if (attempt >= 3) throw new Error(`取得に失敗: ${res.status}`);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
}
const iso = (m) => `${m[1]}-${String(MON.indexOf(m[2]) / 3 + 1).padStart(2, '0')}-${m[3]}`;
const out = [];
const failed = [];
for (const c of CRAFT) {
  let start = START;
  let stop = STOP;
  let text = '';
  // 表が用意されている期間の外を聞くと、Horizons が使える範囲を返す。その範囲で聞き直す
  for (let tries = 0; tries < 4; tries++) {
    text = await get(q(c.naif, start, stop, c.step));
    if (text.includes('$$SOE')) break;
    const after = /after A\.D\. (\d{4})-([A-Z]{3})-(\d{2})/.exec(text);
    const before = /(?:prior to|before) A\.D\. (\d{4})-([A-Z]{3})-(\d{2})/.exec(text);
    if (after) stop = iso(after);
    else if (before) start = iso(before);
    else break;
  }
  const body = text.split('$$SOE')[1]?.split('$$EOE')[0]?.trim();
  if (!body) {
    failed.push([c.naif, c.nameJa, text.split('\n').filter((l) => /No ephemeris|No matches|ERROR/i.test(l))[0]?.trim() ?? '']);
    continue;
  }
  const rows = body.split('\n').map((l) => l.split(',').map((v) => v.trim()));
  // JDTDB, 日付, X, Y, Z, VX, VY, VZ
  const startUnixDays = Number(rows[0][0]) - 2440587.5;
  const pv = rows.flatMap((f) => [2, 3, 4].map((i) => Math.round(Number(f[i]))).concat([5, 6, 7].map((i) => Number(Number(f[i]).toFixed(4)))));
  out.push({ id: `V${-c.naif}`, nameJa: c.nameJa, sizeM: c.sizeM, startDays: startUnixDays, stepDays: c.step, pv });
  console.log(`${c.nameJa}: ${rows.length} 点（${rows[0][1].slice(5, 16)} 〜 ${rows.at(-1)[1].slice(5, 16)}）`);
  await new Promise((r) => setTimeout(r, 200));
}
writeFileSync(
  join(root, 'public/data/spacecraft.json'),
  JSON.stringify({
    source: `NASA/JPL Horizons (取得 ${new Date().toISOString().slice(0, 10)})`,
    fields: 'pv: x, y, z (km), vx, vy, vz (km/s). Heliocentric ICRF. startDays: unix days of the first row',
    spacecraft: out,
  }),
);
console.log(`探査機 ${out.length}。取れなかったもの:`, failed);
