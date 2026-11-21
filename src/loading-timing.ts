/**
 * ローディング画面の UFO の動き（2026-11-21。オーナーの指示）。純粋な関数にしてテストする（loading-timing.test.ts）。
 *
 * タイトル画面で船が飛んでくるときと同じ動きにした（src/top/ufo-carousel.ts の flyIn・flyOut をそのまま使う）：
 * - 左の端の外から、光の速さのように速く飛んできて、減速して画面の真ん中で止まる（flyIn。1.1 秒）
 * - 準備ができたら、ゆっくり動き出し、加速して右の端の外へ消える（flyOut。0.7 秒）。消えたときに次の画面へ切り替える
 * - **いつも 2 秒以上かける**（準備が 0.5 秒でできても、2 秒で右の端の外へ出る）
 * 位置 x は −1（左の端の外）・0（真ん中）・1（右の端の外）。speed は 0〜1（光の筋と傾きに使う。タイトル画面と同じ）
 */
import { flyIn, flyOut, FLY_IN_MS, FLY_OUT_MS } from './top/ufo-carousel';

export const MIN_MS = 2_000;
export { FLY_IN_MS, FLY_OUT_MS };
/** 前のページから引き継ぐ始まりの時刻が、これより古ければ使わない（タブを閉じて残ったものなど） */
export const CARRY_MAX_MS = 120_000;

/** 準備ができた時刻（始まりからの ms）から、右へ飛び去り始める時刻。飛んできて止まってから、かつ、2 秒で出ていけるように */
export const flyOutStartMs = (readyMs: number): number => Math.max(readyMs, FLY_IN_MS, MIN_MS - FLY_OUT_MS);

export interface LoadingMotion {
  x: number;
  speed: number;
  /** 右の端の外へ出た（次の画面へ切り替える） */
  done: boolean;
}

/** 始まりから elapsedMs の UFO。readyMs は準備ができた時刻（まだなら null） */
export function loadingMotion(elapsedMs: number, readyMs: number | null): LoadingMotion {
  const t = Math.max(0, elapsedMs);
  if (readyMs !== null) {
    const out = flyOutStartMs(readyMs);
    if (t >= out) {
      const f = flyOut((t - out) / FLY_OUT_MS);
      return { x: -f.offset, speed: f.speed, done: t >= out + FLY_OUT_MS };
    }
  }
  if (t < FLY_IN_MS) {
    const f = flyIn(t / FLY_IN_MS);
    return { x: -f.offset, speed: f.speed, done: false };
  }
  return { x: 0, speed: 0, done: false };
}

/** 前のページから引き継いだ始まりの時刻を使えるか */
export const usableStart = (startMs: number | null, nowMs: number): startMs is number =>
  startMs !== null && Number.isFinite(startMs) && startMs <= nowMs && nowMs - startMs < CARRY_MAX_MS;

const MAX_UFO_IMAGE_URL_LEN = 200_000;

/** localStorage に覚えた船の絵 URL が安全なデータ URI（PNG/WebP/JPEG の base64）か確かめる */
export const isSafeUfoImageUrl = (url: unknown): url is string =>
  typeof url === 'string' &&
  url.length <= MAX_UFO_IMAGE_URL_LEN &&
  /^data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(url);
