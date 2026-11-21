/**
 * 画面の細い線のアイコン（24 × 24。線の色は文字の色）。同じ働きのボタンは、どこでも同じアイコンにする。
 */

/** マップ（訪れた場所の 3D のマップ。下のアイコンの 6 と、図鑑の「マップで見る」） */
export function MapIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="12" cy="15" rx="9" ry="3.6" />
      <path d="M12 15V6.5M7 13.6V9.5M17.5 14.2v-6" />
      <circle cx="12" cy="5.5" r="1.4" fill="currentColor" />
      <circle cx="7" cy="8.6" r="1.1" fill="currentColor" />
      <circle cx="17.5" cy="7.2" r="1.1" fill="currentColor" />
    </svg>
  );
}

/** 望遠鏡（その方を向く。2026-11-21） */
export function TelescopeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.2 13.2 15.4 7.6l1.6 3.2L5.8 16.4Z" />
      <path d="M15.4 7.6l3.7-1.9 1.6 3.2-3.7 1.9" />
      <path d="M2.6 14l1.6-.8 1.6 3.2-1.6.8Z" />
      <path d="M11 13.4 7.5 21M11 13.4l3.5 7.6M11 13.4V21" />
    </svg>
  );
}

/** 戻る（←） */
export function BackIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}
