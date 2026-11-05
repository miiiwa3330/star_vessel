// 宇宙の部屋（太陽系）に、地球のまわりを動く船を何隻か出す。確かめ用の道具（開発サーバーが動いていること）。
//   使い方：node tools/sim-ships.mjs            （120 秒。船は 4 隻）
//           B=http://localhost:5174 SECONDS=600 node tools/sim-ships.mjs
// 本物のプレイヤーと同じ通信（匿名でログイン → 宇宙の部屋の WebSocket に、4 回/秒で状態を送る）なので、
// タイトル画面の背景の船（/api/earth-ships）・いま遊んでいる人数・世界の画面の他の船が、本物と同じ経路で動く。
// 終わったら、接続を閉じる（船は 5 秒ほどで消える）。Node 22 以上（WebSocket が組み込み）
const B = process.env.B ?? 'http://localhost:5173';
const SECONDS = Number(process.env.SECONDS ?? 120);

async function session() {
  const res = await fetch(`${B}/api/auth/sign-in/anonymous`, { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: '{}' });
  if (!res.ok) throw new Error(`匿名のログインに失敗: ${res.status}`);
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 地球を基準にした円軌道：半径（km）・速さ（km/s）・傾き（ラジアン）・最初の位相
const orbits = [
  { r: 18_000, speed: 700, incl: 0.5, phase: 0.0 },
  { r: 24_000, speed: 500, incl: -0.9, phase: 2.1 },
  { r: 14_000, speed: 900, incl: 1.2, phase: 4.0 },
  { r: 32_000, speed: 400, incl: 0.1, phase: 5.2 },
];

const socks = [];
for (const o of orbits) {
  const cookie = await session();
  const ws = new WebSocket(`ws://${new URL(B).host}/api/space/SOL`, { headers: { cookie, origin: B } });
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('宇宙の部屋につながらない（開発サーバーは動いていますか）'));
  });
  socks.push({ ws, o });
}
console.log(`船を ${socks.length} 隻出した（${SECONDS} 秒）`);
const t0 = Date.now();
while (Date.now() - t0 < SECONDS * 1000) {
  const t = (Date.now() - t0) / 1000;
  for (const { ws, o } of socks) {
    const a = o.phase + (o.speed / o.r) * t;
    const offsetKm = { x: o.r * Math.cos(a), y: o.r * Math.sin(a) * Math.cos(o.incl), z: o.r * Math.sin(a) * Math.sin(o.incl) };
    const velocityKmS = { x: -o.speed * Math.sin(a), y: o.speed * Math.cos(a) * Math.cos(o.incl), z: o.speed * Math.cos(a) * Math.sin(o.incl) };
    ws.send(JSON.stringify({ t: 'state', s: { anchor: 'Earth', offsetKm, velocityKmS, orientation: { x: 0, y: 0, z: 0, w: 1 } }, d: { v: 1, hull: 'saucer' } }));
  }
  await wait(250);
}
for (const { ws } of socks) ws.close();
console.log('終わり');
