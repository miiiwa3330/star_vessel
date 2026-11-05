// 星団の本物のメンバーの星 public/data/cluster-members/*.bin を作る。使い方：npm run cluster-members（先に npm run clusters）
// 出どころ：Hunt & Reffert (2023) のメンバーの表（VizieR J/A+A/673/A114/members、ハーバード大学のミラー）。Gaia DR3 の星。
// 1 つの星は 5 個の 32bit 小数：x・y・z（pc・EQJ）、絶対等級（G から V へ直した値）、B−V。決まりは docs/tech/clusters.md。
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'tools/.cache/clusters/members.tsv');
const URL_MEMBERS =
  'https://vizier.cfa.harvard.edu/viz-bin/asu-tsv?-source=J/A%2BA/673/A114/members&-out=Name,RA_ICRS,DE_ICRS,Plx,e_Plx,Gmag,BPmag,RPmag&-out.max=2000000';
if (!existsSync(file)) {
  mkdirSync(dirname(file), { recursive: true });
  console.log(`取得中: ${URL_MEMBERS}`);
  const res = await fetch(URL_MEMBERS);
  if (!res.ok) throw new Error(`取得に失敗: ${res.status}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}
/** 星団ごとの星の数の上限（明るい順。src/world/clusters.ts の MAX_MEMBERS と同じ） */
const MAX = { o: 1_500, g: 4_000 };
/** 1 つのファイルに入れる星団の数の見当。近づいたときに小さなファイルだけ読むため */
const SHARDS = 256;
/** この距離（pc）より近く、視差の精度が 20σ より良い星は、星ごとの視差で距離を決める */
const USE_PARALLAX_WITHIN_PC = 500;
const DEG = Math.PI / 180;

const clusters = new Map(JSON.parse(readFileSync(join(root, 'public/data/clusters.json'), 'utf8')).clusters.map((c) => [c[0], c]));

function hash32(s) {
  let h = 0x811c9dc5;
  for (const ch of Buffer.from(s, 'utf8')) {
    h ^= ch;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
/** 名前を種にする乱数（奥行きのばらつき用） */
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const byCluster = new Map();
let header = null;
let lineNo = 0;
let total = 0;
for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
  if (!line || line.startsWith('#')) continue;
  if (!header) {
    header = line.split('\t').map((s) => s.trim());
    lineNo = 1;
    continue;
  }
  if (lineNo++ < 3) continue;
  const f = line.split('\t');
  const name = f[0].trim().replace(/_/g, ' ');
  if (!clusters.has(name)) continue;
  total++;
  if (!byCluster.has(name)) byCluster.set(name, []);
  byCluster.get(name).push([Number(f[1]), Number(f[2]), Number(f[3]), Number(f[4]), Number(f[5]), Number(f[6]), Number(f[7])]);
}

const shards = Array.from({ length: SHARDS }, () => []);
const index = {};
let kept = 0;
for (const [name, stars] of byCluster) {
  const c = clusters.get(name);
  const [cx, cy, cz, r50] = [c[3], c[4], c[5], c[6]];
  const dist = Math.hypot(cx, cy, cz);
  const rand = mulberry32(hash32(name));
  stars.sort((a, b) => a[4] - b[4]);
  const list = stars.slice(0, MAX[c[2]] ?? MAX.o);
  const shard = hash32(name) % SHARDS;
  const start = shards[shard].length / 5;
  for (const [ra, dec, plx, ePlx, g, bp, rp] of list) {
    if (!Number.isFinite(g)) continue;
    const dir = [Math.cos(dec * DEG) * Math.cos(ra * DEG), Math.cos(dec * DEG) * Math.sin(ra * DEG), Math.sin(dec * DEG)];
    // 視差の誤差は遠い星団の大きさよりずっと大きいので、遠い星団は星団の距離に置き、奥行きは大きさに合わせてばらつかせる（奥行きだけは本物ではない）
    let d;
    if (dist < USE_PARALLAX_WITHIN_PC && plx > 0 && plx / ePlx > 20) d = 1000 / plx;
    else {
      const u1 = Math.max(rand(), 1e-9);
      d = dist + Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rand()) * r50 * 0.85;
    }
    const color = Number.isFinite(bp) && Number.isFinite(rp) ? bp - rp : 0.8;
    // G → V（Riello ほか 2021）。ちりによる減光は直さない（地球から見た明るさが本物と合うように）
    const gMinusV = -0.02704 + 0.01424 * color - 0.2156 * color ** 2 + 0.01426 * color ** 3;
    const absV = g - gMinusV - 5 * Math.log10(dist / 10);
    shards[shard].push(dir[0] * d, dir[1] * d, dir[2] * d, absV, Math.min(2, 0.79 * color));
    kept++;
  }
  index[name] = [shard, start, shards[shard].length / 5 - start];
}
const outDir = join(root, 'public/data/cluster-members');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
let bytes = 0;
shards.forEach((s, i) => {
  const data = new Float32Array(s);
  bytes += data.byteLength;
  writeFileSync(join(outDir, `${i}.bin`), Buffer.from(data.buffer));
});
writeFileSync(join(root, 'public/data/cluster-members.json'), JSON.stringify({ source: 'Hunt & Reffert (2023), A&A 673, A114 (Gaia DR3 members)', fields: '[shard, start, count]; 5 floats per star: x, y, z (pc, EQJ), absolute V, B-V', index }));
console.log(`星団 ${byCluster.size}。メンバー ${total} 個のうち ${kept} 個を使った。${(bytes / 1024 / 1024).toFixed(1)} MB（${SHARDS} ファイル）`);
