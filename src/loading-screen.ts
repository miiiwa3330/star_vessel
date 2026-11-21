/**
 * ローディング画面（2026-11-21。オーナーの指示）。「-Go!-」→ 世界、世界の「タイトルへ」→ タイトル画面の間に出す。
 *
 * - **飛ぶ UFO は、選んだ船そのもの**：タイトル画面・世界で、その船を three.js で描いた絵（src/render/ufo-look.ts の snapshotUfo）を
 *   この端末に覚えておき（rememberUfoLook）、ここで使う。絵がまだ無いときは、簡単な絵（SVG）で代わりにする
 * - **動きはタイトル画面で船が飛んでくるときと同じ**（loading-timing.ts）：左の外から速く飛んできて減速して真ん中で止まり、
 *   準備ができたら加速して右の外へ消える。消えたときに次の画面へ切り替える。いつも 2 秒以上。
 *   速いあいだだけ、後ろに光の筋（ベイパー）を引き、進む向きに傾く（タイトル画面と同じ数）
 * - 動きは前もって計算して、ブラウザのアニメーション（Web Animations）で動かす。ページが重い間も止まらない
 * - ページを移っても続く：始まりの時刻を sessionStorage で引き継ぐ（飛び方は時刻だけで決まるので、続きの場所から描ける）
 * React・three.js を使わず、DOM だけで作る（大きなファイルを読む前に、すぐに出すため）
 */
import './loading-screen.css';
import { FLY_IN_MS, FLY_OUT_MS, flyOutStartMs, isSafeUfoImageUrl, loadingMotion, usableStart } from './loading-timing';

const ID = 'sv-loading';
const START_KEY = 'sv-loading-start';
const LOOK_KEY = 'sv-ufo-look';

/** 光の筋（タイトル画面の src/top/ufo-layer.ts と同じ）：[上下のずれ, 太さ, 長さ]（船の直径に対する割合）と、いちばん速いときの長さ */
const STREAKS: readonly (readonly [number, number, number])[] = [
  [0, 0.1, 1],
  [0.2, 0.035, 0.7],
  [-0.17, 0.045, 1.25],
];
const STREAK_MAX = 11;
/** 進む向きへの傾き（ラジアン。いちばん速いとき）。タイトル画面と同じ */
const BANK_RAD = 0.3;
/** 飛び方を何ミリ秒ごとに区切って、アニメーションの節目にするか */
const STEP_MS = 1000 / 60;

/** 絵が無いときの、簡単な UFO の絵 */
const FALLBACK_SVG = `
<svg class="sv-loading-ufo" viewBox="0 0 120 64" aria-hidden="true">
  <path d="M40 30 Q60 4 80 30 Z" fill="#1d3b55"/>
  <ellipse cx="60" cy="36" rx="54" ry="11" fill="#7fc9d6"/>
  <ellipse cx="60" cy="38" rx="54" ry="7" fill="none" stroke="#2a3038" stroke-width="2"/>
  <circle cx="16" cy="38" r="2.2" fill="#ff8fa3"/><circle cx="34" cy="43" r="2.2" fill="#7dffb2"/>
  <circle cx="60" cy="45" r="2.2" fill="#8ee6ff"/><circle cx="86" cy="43" r="2.2" fill="#ffe27a"/>
  <circle cx="104" cy="38" r="2.2" fill="#ff8fa3"/>
</svg>`;

let startMs = 0;
let readyMs: number | null = null;
let anims: Animation[] = [];
let outTimer = 0;

const store = {
  get(k: string, s: Storage | null): string | null {
    try {
      return s?.getItem(k) ?? null;
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null, s: Storage | null): void {
    try {
      if (v === null) s?.removeItem(k);
      else s?.setItem(k, v);
    } catch {
      // 保存できない（プライベートな閲覧など）ときは、覚えない
    }
  },
};
const session = (): Storage | null => (typeof sessionStorage === 'undefined' ? null : sessionStorage);
const local = (): Storage | null => (typeof localStorage === 'undefined' ? null : localStorage);

/** 選んだ船の絵を、この端末に覚えておく（次のローディングから使う）。絵は snapshotUfo の data URL */
export function rememberUfoLook(hull: string, hue: number, url: string): void {
  store.set(LOOK_KEY, JSON.stringify({ hull, hue, url }), local());
}

/** 覚えている船の絵（無ければ null） */
export function rememberedUfoLook(): { hull: string; hue: number; url: string } | null {
  const v = store.get(LOOK_KEY, local());
  if (!v) return null;
  try {
    const o = JSON.parse(v) as { hull?: unknown; hue?: unknown; url?: unknown };
    return isSafeUfoImageUrl(o.url) && typeof o.hull === 'string' && typeof o.hue === 'number'
      ? { hull: o.hull, hue: o.hue, url: o.url }
      : null;
  } catch {
    return null;
  }
}

const readStart = (): number | null => {
  const v = store.get(START_KEY, session());
  return v === null ? null : Number(v);
};

/** 前のページでローディングを始めていて、その続きがあるか（タイトル画面へ戻ってきたとき、出すかどうかに使う） */
export function hasPendingLoading(): boolean {
  return usableStart(readStart(), Date.now());
}

/** UFO の大きさ（px。CSS の --sv-ufo）と、左右の外の位置 */
function geometry(el: HTMLElement): { size: number; farLeft: number; farRight: number } {
  const size = el.querySelector<HTMLElement>('.sv-loading-craft')?.offsetWidth || 120;
  const half = window.innerWidth / 2;
  return { size, farLeft: -(half + size * 0.7), farRight: half + size * 0.7 };
}

/** fromMs〜toMs の飛び方を、アニメーションにして動かす（UFO の位置・傾き・光の筋） */
function play(el: HTMLElement, fromMs: number, toMs: number, delayMs: number, currentMs: number, ready: number | null): Animation[] {
  const { farLeft, farRight } = geometry(el);
  const path = el.querySelector<HTMLElement>('.sv-loading-path');
  const bank = el.querySelector<HTMLElement>('.sv-loading-bank');
  const streaks = [...el.querySelectorAll<HTMLElement>('.sv-loading-streak')];
  if (!path || !bank) return [];
  const span = Math.max(1, toMs - fromMs);
  const pathFrames: Keyframe[] = [];
  const bankFrames: Keyframe[] = [];
  const streakFrames: Keyframe[][] = streaks.map(() => []);
  for (let t = fromMs; ; t = Math.min(toMs, t + STEP_MS)) {
    const m = loadingMotion(t, ready);
    const offset = (t - fromMs) / span;
    const x = m.x >= 0 ? m.x * farRight : -m.x * farLeft;
    pathFrames.push({ transform: `translateX(${x}px)`, offset });
    bankFrames.push({ transform: `rotate(${m.speed * BANK_RAD}rad)`, offset });
    const s = m.speed > 0.004 ? m.speed : 0;
    // 筋の長さ：船の直径 × 筋ごとの長さ × (0.6 + 11 × 速さ)、明るさ：速さ × 1.5（タイトル画面と同じ）。「直径 × 筋ごとの長さ」は CSS の幅
    streaks.forEach((_, i) => streakFrames[i].push({ transform: `scaleX(${s > 0 ? 0.6 + STREAK_MAX * s : 0.001})`, opacity: Math.min(1, s * 1.5), offset }));
    if (t >= toMs) break;
  }
  const opts: KeyframeAnimationOptions = { duration: span, delay: delayMs, fill: 'forwards', easing: 'linear' };
  const list = [path.animate(pathFrames, opts), bank.animate(bankFrames, opts), ...streaks.map((st, i) => st.animate(streakFrames[i], opts))];
  if (currentMs > 0) for (const a of list) a.currentTime = currentMs;
  return list;
}

/** ローディング画面を出す。前のページから続いていれば、その続きの場所から */
export function showLoading(): void {
  const now = Date.now();
  const carried = readStart();
  startMs = usableStart(carried, now) ? carried : now;
  store.set(START_KEY, String(startMs), session());
  readyMs = null;
  clearTimeout(outTimer);
  let el = document.getElementById(ID);
  if (!el) {
    el = document.createElement('div');
    el.id = ID;
    el.className = 'sv-loading';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-label', '読み込み中');
    const pathEl = document.createElement('div');
    pathEl.className = 'sv-loading-path';
    const craftEl = document.createElement('div');
    craftEl.className = 'sv-loading-craft';
    const streaksEl = document.createElement('div');
    streaksEl.className = 'sv-loading-streaks';
    for (const [y, thick, len] of STREAKS) {
      const streak = document.createElement('i');
      streak.className = 'sv-loading-streak';
      streak.style.setProperty('--sy', String(y));
      streak.style.setProperty('--st', String(thick));
      streak.style.setProperty('--sl', String(len));
      streaksEl.appendChild(streak);
    }
    const bankEl = document.createElement('div');
    bankEl.className = 'sv-loading-bank';
    const bobEl = document.createElement('div');
    bobEl.className = 'sv-loading-bob';
    const look = rememberedUfoLook();
    if (look) {
      const img = document.createElement('img');
      img.className = 'sv-loading-ufo';
      img.src = look.url;
      img.alt = '';
      img.draggable = false;
      bobEl.appendChild(img);
    } else {
      bobEl.innerHTML = FALLBACK_SVG;
    }
    const wordEl = document.createElement('p');
    wordEl.className = 'sv-loading-word';
    wordEl.lang = 'en';
    wordEl.textContent = 'LOADING';
    bankEl.appendChild(bobEl);
    craftEl.append(streaksEl, bankEl);
    pathEl.appendChild(craftEl);
    el.append(pathEl, wordEl);
    document.body.appendChild(el);
  }
  el.classList.remove('is-leaving');
  anims.forEach((a) => a.cancel());
  // 飛んできて止まるところ（始まりから FLY_IN_MS まで）。ページが変わって途中からなら、その場所から
  const elapsed = now - startMs;
  anims = play(el, 0, FLY_IN_MS, 0, Math.min(elapsed, FLY_IN_MS), null);
}

/** ここからローディングを始める（ページを移る前に呼ぶ。UFO は左の外から） */
export function beginLoading(): void {
  store.set(START_KEY, String(Date.now()), session());
  showLoading();
}

/** 準備ができた。UFO は（止まってからなら）加速して右の外へ消え、そのときに切り替わる。いつも 2 秒以上かける */
export function finishLoading(): void {
  const el = document.getElementById(ID);
  if (!el || readyMs !== null) return;
  readyMs = Date.now() - startMs;
  const out = flyOutStartMs(readyMs);
  const elapsed = Date.now() - startMs;
  const delay = Math.max(0, out - elapsed);
  // 飛び去るところを、始まりの時刻に合わせて加える（飛んできて止まるところは、そのまま最後まで動かす）
  const outAnims = play(el, out, out + FLY_OUT_MS, delay, Math.max(0, elapsed - out), readyMs);
  anims.push(...outAnims);
  const last = outAnims[0];
  if (last) void last.finished.then(() => hideLoading()).catch(() => {});
  // タブが裏にあってアニメーションが進まないときのために、遅くとも着く時刻の少しあとには消す
  outTimer = window.setTimeout(hideLoading, delay + FLY_OUT_MS + 1_500);
}

/** すぐに消す（動かせなかったときなど） */
export function hideLoading(): void {
  store.set(START_KEY, null, session());
  readyMs = null;
  clearTimeout(outTimer);
  const el = document.getElementById(ID);
  if (!el || el.classList.contains('is-leaving')) return;
  el.classList.add('is-leaving');
  setTimeout(() => {
    el.remove();
    anims.forEach((a) => a.cancel());
    anims = [];
  }, 300);
}
