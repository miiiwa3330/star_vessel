/**
 * 照準と、照準の先の天体の名前・距離（要件 F36）。画面の真ん中に固定して出す（宇宙の中の天体には文字を付けない）。
 * くわしい情報は、クリック・タップで選ぶとカードに出る
 */
export function AimLabel({ aim }: { aim: { name: string; distance: string } | null }) {
  return (
    <div className="hud-aim" aria-live="polite">
      <div className={`hud-aim-mark${aim ? ' is-on' : ''}`} aria-hidden="true" />
      {aim && (
        <div className="hud-aim-label">
          {aim.name} <span className="hud-muted">・ {aim.distance}</span>
        </div>
      )}
    </div>
  );
}
