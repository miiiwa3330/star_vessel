/**
 * 地球の画像の出典の 1 行（CC BY 4.0 の表記。要件 F48）。景色をふさがないよう、小さく薄く出す。
 * タイトル画面の最初の画面では下の端に、詳細の最後と準備画面では、その続きに置く（className で置き方を変える）
 */
export function Credit({ className = '' }: { className?: string }) {
  return (
    <p className={`top-credit ${className}`.trim()}>
      地球の画像：<a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>Solar System Scope</a>（CC BY 4.0）
    </p>
  );
}
