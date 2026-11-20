/**
 * ローディング画面（2026-11-21。オーナーの指示）。タイトル画面で「-Go!-」を押してから、世界の画面（/play）が動き出すまで。
 * UFO が左から右へ、ふらふらと進む（見た目は loading-screen.css）。
 *
 * - タイトル画面：「-Go!-」を押したら showLoading()（ページが変わるまで出しておく）
 * - 世界の画面：src/entry.ts が、読み込みのはじめに showLoading() する。src/main.ts が、最初の 1 枚を描けたら hideLoading()
 * React・three.js を使わず、DOM だけで作る（大きなファイルを読む前に、すぐに出すため）
 */
import './loading-screen.css';

const ID = 'sv-loading';

const UFO_SVG = `
<svg class="sv-loading-ufo" viewBox="0 0 120 64" aria-hidden="true">
  <defs>
    <linearGradient id="sv-ufo-hull" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#bfeaf2"/><stop offset="1" stop-color="#4f8f9e"/>
    </linearGradient>
    <radialGradient id="sv-ufo-dome" cx="40%" cy="35%" r="70%">
      <stop offset="0" stop-color="#6fb7d6"/><stop offset="1" stop-color="#14304a"/>
    </radialGradient>
  </defs>
  <ellipse class="sv-loading-glow" cx="60" cy="50" rx="18" ry="4" fill="rgba(140,220,255,0.8)"/>
  <path d="M40 30 Q60 4 80 30 Z" fill="url(#sv-ufo-dome)"/>
  <ellipse cx="60" cy="36" rx="54" ry="11" fill="url(#sv-ufo-hull)"/>
  <ellipse cx="60" cy="38" rx="54" ry="7" fill="none" stroke="#2a3038" stroke-width="2"/>
  <circle cx="16" cy="38" r="2.2" fill="#ff8fa3"/><circle cx="34" cy="43" r="2.2" fill="#7dffb2"/>
  <circle cx="60" cy="45" r="2.2" fill="#8ee6ff"/><circle cx="86" cy="43" r="2.2" fill="#ffe27a"/>
  <circle cx="104" cy="38" r="2.2" fill="#ff8fa3"/>
</svg>`;

/** ローディング画面を出す（もう出ていれば、そのまま） */
export function showLoading(): void {
  const old = document.getElementById(ID);
  if (old) {
    old.classList.remove('is-leaving');
    return;
  }
  const el = document.createElement('div');
  el.id = ID;
  el.className = 'sv-loading';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', '読み込み中');
  el.innerHTML = `<div class="sv-loading-path">${UFO_SVG}</div><p class="sv-loading-word" lang="en">LOADING</p>`;
  document.body.appendChild(el);
}

/** ローディング画面を、ふっと消す */
export function hideLoading(): void {
  const el = document.getElementById(ID);
  if (!el || el.classList.contains('is-leaving')) return;
  el.classList.add('is-leaving');
  setTimeout(() => el.remove(), 700);
}
