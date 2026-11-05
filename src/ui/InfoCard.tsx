import { hudActions, type InfoCardState } from './hud-store';

/**
 * 情報のカード（要件 F36・F37）。選んだ天体と、近づいた天体の情報を、画面の上の真ん中に出す（照準の先は AimLabel）。
 * 宇宙の中には文字を出さない（デザインの決まり）
 */
export function InfoCard({ card }: { card: InfoCardState }) {
  return (
    <div className={`hud-panel hud-info-card is-${card.source}`} role="status" aria-live="polite">
      <div className="hud-info-head">
        <span className="hud-muted hud-small">
          {card.source === 'near' ? '近くに来ました' : '選んだ天体'}
        </span>
        {card.firstVisit && <span className="hud-info-new">はじめて訪れた</span>}
      </div>
      <div className="hud-title">{card.name}</div>
      <div className="hud-small">{card.distance}</div>
      <ul className="hud-info-lines">
        {card.details.map((d) => (
          <li key={d} className="hud-small">
            {d}
          </li>
        ))}
      </ul>
      {card.source === 'selected' && (
        <div className="hud-info-actions">
          <button type="button" className="hud-button hud-button-small" onClick={() => hudActions.faceTarget()}>
            その方を向く
          </button>
          <button type="button" className="hud-button hud-button-small" onClick={() => hudActions.selectTarget(null)}>
            選ぶのをやめる
          </button>
        </div>
      )}
    </div>
  );
}
