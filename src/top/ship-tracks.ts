/**
 * タイトル画面の背景の船を、滑らかに動かす（要件 F53）。船の位置は 2 秒に 1 回しか届かないので、
 * 届いた位置から、速度のまま進めた位置を描き、次が届いたときの食い違いは、すぐに消さず少しずつ消す。
 * 船が現れる・消えるときは、急に出し入れせずに、1 秒かけて明るさを変える。
 * 世界の画面の他の船の動かし方（src/world/ship-smoothing.ts）と同じ考えで、こちらは地球の中心が原点の位置だけを扱う。
 */
import type { EarthShip, EarthShipsSnapshot } from '../world/earth-ships-schema';
import { add, length, scale, sub, type Vec3 } from '../world/vec';

/** 位置の食い違いが 1/e になるまでの時間（秒）。届く間隔（2 秒）の中で、ほぼ消える。見た目のための値 */
export const ERROR_TAU_S = 0.6;
/** 食い違いがこれ（km）より小さければ、必ず滑らせる */
const MIN_SNAP_KM = 2_000;
/** 食い違いが、船の速さでこの秒数ぶんを超えたら、滑らせずに移す（ワープとみなす） */
const SNAP_SECONDS = 1.5;
/** 速度のまま進めるのは、最後に届いてからこの秒数まで（それより長く届かなければ、止めておく） */
export const MAX_EXTRAPOLATE_S = 8;
/** 現れる・消えるときの明るさの変わる時間（秒） */
export const FADE_S = 1;

export interface TrackedShip {
  id: string;
  hue: number;
  /** 地球の中心からの位置（km・EQJ） */
  position: Vec3;
  /** 地球に対する速度（km/s・EQJ） */
  velocity: Vec3;
  /** 明るさ（0〜1）。現れるとき 0 から 1 へ、消えるとき 1 から 0 へ */
  fade: number;
}

interface Track {
  hue: number;
  /** 最後に届いた位置と速度、それが「いま」の位置になる時刻（ブラウザの時計・ms） */
  base: Vec3;
  velocity: Vec3;
  at: number;
  /** いま見えている位置と、予測した位置の食い違い（少しずつ 0 にする） */
  error: Vec3;
  fade: number;
  alive: boolean;
}

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const predicted = (t: Track, nowMs: number): Vec3 => add(t.base, scale(t.velocity, Math.min(MAX_EXTRAPOLATE_S, Math.max(0, (nowMs - t.at) / 1000))));

export class ShipTracks {
  private readonly tracks = new Map<string, Track>();
  /** サーバーの時計とブラウザの時計の差（の下限の見積もり）。届いた位置が、サーバーで何秒前のものかを知るため */
  private offsetMs = Number.POSITIVE_INFINITY;

  /**
   * 新しい位置が届いたとき。receivedMs は、ブラウザの時計で受け取った時刻。
   * 受け取った位置は、サーバーが計算した時刻（snapshot.now）のもの。サーバーは同じ答えを数秒覚えているので、
   * 受け取ったときには、少し古い。時計の差の最小値（届くのが最も早かったとき）を基準に、古さを見積もって進めておく
   */
  ingest(snapshot: EarthShipsSnapshot, receivedMs: number): void {
    this.offsetMs = Math.min(this.offsetMs, receivedMs - snapshot.now);
    const ageMs = Math.max(0, receivedMs - snapshot.now - this.offsetMs);
    const seen = new Set<string>();
    for (const s of snapshot.ships) {
      seen.add(s.id);
      this.set(s, receivedMs, ageMs);
    }
    for (const [id, t] of this.tracks) if (!seen.has(id)) t.alive = false;
  }

  private set(s: EarthShip, receivedMs: number, ageMs: number): void {
    // 位置の時刻（snapshot.now）から、いままでに進んだ分
    const base = add(s.position, scale(s.velocity, ageMs / 1000));
    const t = this.tracks.get(s.id);
    if (!t) {
      this.tracks.set(s.id, { hue: s.hue, base, velocity: s.velocity, at: receivedMs, error: ZERO, fade: 0, alive: true });
      return;
    }
    // いま見えている位置と、新しい位置の差を、食い違いとして残す（同じ時刻どうしで比べる）
    const shown = add(predicted(t, receivedMs), t.error);
    const error = sub(shown, base);
    const speed = Math.max(length(s.velocity), length(t.velocity));
    t.error = length(error) > Math.max(MIN_SNAP_KM, speed * SNAP_SECONDS) ? ZERO : error;
    t.base = base;
    t.velocity = s.velocity;
    t.at = receivedMs;
    t.hue = s.hue;
    t.alive = true;
  }

  /** 毎フレーム呼ぶ。nowMs はブラウザの時計、dt は前のフレームからの秒数。消えきった船は、ここで捨てる */
  positions(nowMs: number, dt: number): TrackedShip[] {
    const decay = Math.exp(-dt / ERROR_TAU_S);
    const step = dt / FADE_S;
    const out: TrackedShip[] = [];
    for (const [id, t] of this.tracks) {
      t.error = scale(t.error, decay);
      t.fade = t.alive ? Math.min(1, t.fade + step) : Math.max(0, t.fade - step);
      if (!t.alive && t.fade <= 0) {
        this.tracks.delete(id);
        continue;
      }
      out.push({ id, hue: t.hue, position: add(predicted(t, nowMs), t.error), velocity: t.velocity, fade: t.fade });
    }
    return out;
  }
}
