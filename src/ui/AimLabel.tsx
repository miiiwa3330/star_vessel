/**
 * 照準と、照準の先の天体の名前・距離（要件 F36）。画面の真ん中に固定して出す（宇宙の中の天体には文字を付けない）。
 * 星座の線を出しているときは、照準の先の星座の名前も出す（要件 F40）。
 * くわしい情報は、クリック・タップで選ぶとカードに出る
 */
export function AimLabel({ aim, constellation }: { aim: { name: string; distance: string } | null; constellation: string | null }) {
  return (
    <div className="hud-aim" aria-live="polite">
      <div className={`hud-aim-mark${aim ? ' is-on' : ''}`} aria-hidden="true" />
      {aim && (
        <div className="hud-aim-label">
          {aim.name} <span className="hud-muted">・ {aim.distance}</span>
        </div>
      )}
      {constellation && <div className={`hud-aim-label hud-muted${aim ? ' hud-aim-second' : ''}`}>{constellation}</div>}
    </div>
  );
}
