import { MIIIWA_URL, X_URL } from './links';

/**
 * 画面の右上の、X と Miiiwa のアイコン（押すと、それぞれのページが新しいタブで開く）。
 * アイコンは、図形だけの SVG（画像のファイルを読み込まない）。
 * Miiiwa のアイコンは、オーナーのロゴ（オレンジの 3 つの点と 3 本の縦棒の「iii」）。もとのロゴは棒が黒（白い地に置く）ので、暗い背景では、棒を明るい色にしている
 */
export function SocialLinks() {
  return (
    <nav className="top-social" aria-label="リンク">
      <a href={X_URL} className="top-social-link" target="_blank" rel="noopener noreferrer" aria-label="X（旧 Twitter）">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
          />
        </svg>
      </a>
      <a href={MIIIWA_URL} className="top-social-link" target="_blank" rel="noopener noreferrer" aria-label="Miiiwa">
        <svg viewBox="0 0 512 512" width="24" height="24" aria-hidden="true" focusable="false">
          <g fill="#ff6400">
            <rect x="112.88" y="71.68" width="65.05" height="65.05" />
            <rect x="223.47" y="71.68" width="65.05" height="65.05" />
            <rect x="334.06" y="71.68" width="65.05" height="65.05" />
          </g>
          <g fill="currentColor">
            <rect x="115.41" y="181.55" width="59.99" height="258.77" />
            <rect x="226" y="181.55" width="59.99" height="258.77" />
            <rect x="336.59" y="181.55" width="59.99" height="258.77" />
          </g>
        </svg>
      </a>
    </nav>
  );
}
