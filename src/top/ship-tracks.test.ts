import { describe, expect, it } from 'vitest';
import { ERROR_TAU_S, FADE_S, ShipTracks } from './ship-tracks';
import type { EarthShip } from '../world/earth-ships-schema';

const ship = (id: string, x: number, vx = 0, hue = 100): EarthShip => ({ id, hue, position: { x, y: 0, z: 0 }, velocity: { x: vx, y: 0, z: 0 } });
/** 時刻 now（サーバーの時計）に、ブラウザの時計 received で受け取ったもの */
const snap = (now: number, ...ships: EarthShip[]) => ({ now, ships });
const at = (t: ShipTracks, ms: number, dt = 0.016) => t.positions(ms, dt);

describe('背景の船の動かし方', () => {
  it('届いた位置から、速度のまま進めた位置を出す', () => {
    const t = new ShipTracks();
    t.ingest(snap(1_000, ship('a', 20_000, 500)), 1_000);
    const p = at(t, 3_000)[0];
    expect(p.position.x).toBeCloseTo(20_000 + 500 * 2, 0);
  });

  it('サーバーが覚えていた古い答え（2 秒前）は、その古さの分だけ進める', () => {
    const t = new ShipTracks();
    // 1 回目：すぐ届いた（時計の差の基準になる）
    t.ingest(snap(10_000, ship('a', 0, 100)), 10_000);
    // 2 回目：サーバーが 2 秒前に計算した答えを、キャッシュから受け取った
    t.ingest(snap(10_500, ship('a', 100 * 0.5, 100)), 12_500);
    const p = at(t, 12_500, 0.0001)[0];
    // 位置の時刻（10,500）から、受け取った時刻（12,500）までの 2 秒ぶん進んでいる
    expect(p.position.x).toBeCloseTo(50 + 200, 0);
  });

  it('次が届いたときの食い違いは、すぐに消さず、少しずつ消える', () => {
    const t = new ShipTracks();
    t.ingest(snap(0, ship('a', 20_000, 0)), 0);
    at(t, 100, 0.1);
    // 速度が 0 のはずが、実際は 800 km ずれていた
    t.ingest(snap(2_000, ship('a', 20_800, 0)), 2_000);
    const first = at(t, 2_000, 0.0001)[0].position.x;
    expect(first).toBeCloseTo(20_000, 0);
    const later = at(t, 2_000 + ERROR_TAU_S * 1000, ERROR_TAU_S)[0].position.x;
    expect(later).toBeGreaterThan(20_000);
    expect(later).toBeLessThan(20_800);
    // 3 秒後には、ほぼ消えている（残りは数 km）
    expect(at(t, 6_000, 3)[0].position.x).toBeCloseTo(20_800, -1);
  });

  it('大きく食い違ったとき（ワープなど）は、滑らせずにその場所へ移す', () => {
    const t = new ShipTracks();
    t.ingest(snap(0, ship('a', 20_000, 500)), 0);
    at(t, 100, 0.1);
    t.ingest(snap(2_000, ship('a', 400_000, 500)), 2_000);
    expect(at(t, 2_000, 0.0001)[0].position.x).toBeCloseTo(400_000 + 0, -1);
  });

  it('届かなくなった船は、速度のまま進み続けず、一定の時間で止まる', () => {
    const t = new ShipTracks();
    t.ingest(snap(0, ship('a', 0, 100)), 0);
    const x30 = at(t, 30_000)[0].position.x;
    const x60 = at(t, 60_000)[0].position.x;
    expect(x30).toBe(x60);
    expect(x30).toBeCloseTo(800, 0);
  });

  it('現れるときは 0 から、消えるときは 0 へ、1 秒かけて明るさが変わり、消えきったら捨てる', () => {
    const t = new ShipTracks();
    t.ingest(snap(0, ship('a', 0)), 0);
    expect(at(t, 0, 0)[0].fade).toBe(0);
    expect(at(t, 500, FADE_S / 2)[0].fade).toBeCloseTo(0.5, 6);
    expect(at(t, 1_000, FADE_S)[0].fade).toBe(1);
    t.ingest(snap(2_000), 2_000);
    expect(at(t, 2_250, FADE_S / 4)[0].fade).toBeCloseTo(0.75, 6);
    expect(at(t, 3_000, FADE_S)).toHaveLength(0);
    expect(at(t, 3_100, 0.1)).toHaveLength(0);
  });

  it('消えかけの船が戻ってきたら、明るさを戻す', () => {
    const t = new ShipTracks();
    t.ingest(snap(0, ship('a', 0)), 0);
    at(t, 1_000, FADE_S);
    t.ingest(snap(2_000), 2_000);
    at(t, 2_500, FADE_S / 2);
    t.ingest(snap(4_000, ship('a', 0)), 4_000);
    expect(at(t, 4_500, FADE_S / 2)[0].fade).toBeCloseTo(1, 6);
  });

  it('船が複数いても、それぞれ別に動く', () => {
    const t = new ShipTracks();
    t.ingest(snap(0, ship('a', 0, 100, 10), ship('b', 1_000, -100, 200)), 0);
    const p = Object.fromEntries(at(t, 1_000).map((s) => [s.id, s]));
    expect(p.a.position.x).toBeCloseTo(100, 0);
    expect(p.b.position.x).toBeCloseTo(900, 0);
    expect(p.a.hue).toBe(10);
    expect(p.b.hue).toBe(200);
  });
});
