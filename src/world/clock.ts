/**
 * 世界の時刻。天体の位置はすべてこの時刻から計算する（要件 F5：現実のいまの時刻に合わせる）。
 * 端末の時計は数秒〜数分ずれていることがあるので、サーバーの時計との差が分かったら合わせる（全員で同じ位置に見えるように）。
 * サーバーにつながらないときは、端末の時計のまま。
 */
let offsetMs = 0;

export const worldNow = (): Date => new Date(Date.now() + offsetMs);

/** サーバーの時計との差（サーバー − 端末。ミリ秒）を入れる。src/net/space-link.ts が使う */
export function setClockOffsetMs(ms: number): void {
  offsetMs = ms;
}
