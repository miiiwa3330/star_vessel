/**
 * 準備画面の下の、地球の画像の出典の 1 行（CC BY 4.0 の表記）。背景の 3D の地球が、この画像を使っているため。
 * 景色をふさがないよう、小さく薄く出す。出典の全部は、タイトル画面の詳細の「CREDITS」（Credits.tsx）にまとめてある
 * （2026-11-06 に、タイトル画面の最初の画面と詳細の最後の 1 行は、そこにまとめた）
 */
export function Credit({ className = '' }: { className?: string }) {
  return (
    <p className={`top-credit ${className}`.trim()}>
      地球の画像：<a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>Solar System Scope</a>（CC BY 4.0）
    </p>
  );
}
