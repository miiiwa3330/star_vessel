/**
 * 世界の時刻。天体の位置はすべてこの時刻から計算する（要件 F5：現実のいまの時刻に合わせる）。
 * 端末の時計は数秒〜数分ずれていることがあるので、サーバーの時計との差が分かったら合わせる（全員で同じ位置に見えるように）。
 * サーバーにつながらないときは、端末の時計のまま。
 *
 * メッセージが届くまでの時間は毎回変わる（数 ms〜数百 ms）。届くたびに時刻を合わせ直すと、動いているものがすべて飛ぶ。
 * そこで ClockSync は、差の見積もりと、実際に使う差を分ける（決まりと実測は docs/tech/world-model.md の「時刻」）。
 * - 見積もり：最近の値のうちいちばん大きいもの（サーバーの時計 − 届いた時刻 は、届くのが遅いほど小さくなるので、大きいほど本物に近い）
 * - 使う差：見積もりへ、少しずつ近づける。時刻は止まらず、戻らない
 */

/** 見積もりに使う、最近の値の数。1 秒に 4 通届くので、約 16 秒ぶん */
const SAMPLE_WINDOW = 64;
/** 使う差を近づける速さ（1 秒あたり 50 ms）。時刻の進み方が 5% 変わるだけなので、動きは飛ばない */
const SLEW_PER_MS = 0.05;
/** これより差が大きいときは、少しずつでは間に合わないので一度で合わせる（ms）。端末の時計が大きくずれているときの 1 回だけ */
const SNAP_MS = 2_000;

export class ClockSync {
  private readonly samples: number[] = [];
  private target = 0;
  private offset = 0;
  private lastLocalMs = Number.NaN;

  /** サーバーの時計の値 serverMs が、端末の時計で localMs に届いた */
  report(serverMs: number, localMs: number): void {
    this.samples.push(serverMs - localMs);
    if (this.samples.length > SAMPLE_WINDOW) this.samples.shift();
    this.target = Math.max(...this.samples);
  }

  /** 端末の時計が localMs のときの、世界の時刻（ms） */
  now(localMs: number): number {
    const elapsed = Number.isNaN(this.lastLocalMs) ? 0 : Math.max(0, localMs - this.lastLocalMs);
    this.lastLocalMs = localMs;
    const gap = this.target - this.offset;
    if (Math.abs(gap) > SNAP_MS) {
      this.offset = this.target;
    } else {
      const step = elapsed * SLEW_PER_MS;
      this.offset += Math.max(-step, Math.min(step, gap));
    }
    return localMs + this.offset;
  }
}

const clock = new ClockSync();

export const worldNow = (): Date => new Date(clock.now(Date.now()));

/** サーバーの時計の値が届いたときに呼ぶ。src/net/space-link.ts が使う */
export function reportServerTime(serverMs: number): void {
  clock.report(serverMs, Date.now());
}
