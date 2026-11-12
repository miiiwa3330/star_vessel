import { formatDistance } from './format';
import { hudActions, type InfoCardState, type WarpListItem } from './hud-store';

/**
 * 情報のカード（要件 F36・F37）。選んだ天体と、近づいた天体の情報を、画面の上の真ん中に出す（照準の先は AimLabel）。
 * 宇宙の中には文字を出さない（デザインの決まり）。docked：レーダーを開いている間（スマホでは、レーダーの下に置く）
 */
export function InfoCard({ card, docked = false }: { card: InfoCardState; docked?: boolean }) {
  return (
    <div className={`hud-panel hud-info-card is-${card.source}${docked ? ' is-docked' : ''}`} role="status" aria-live="polite">
      <div className="hud-info-head">
        <span className="hud-eyebrow">
          {card.source === 'near' ? 'NEAR' : 'TARGET'}
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
          <button type="button" className="hud-button hud-button-small hud-button-quiet" onClick={() => hudActions.selectTarget(null)}>
            選ぶのをやめる
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * レーダーで選んだワープホールのカード（2026-11-12）。TARGET のカードと同じ場所・同じ形で出す。
 * ワープはここから（レーダーを開いている間だけ出す）。消すのはここではなく、そのワープホールまで行って、下のワープホールのボタンで
 */
export function WarpCard({ warp, docked = false }: { warp: WarpListItem; docked?: boolean }) {
  return (
    <div className={`hud-panel hud-info-card is-warp${docked ? ' is-docked' : ''}`} role="status" aria-live="polite">
      <div className="hud-info-head">
        <span className="hud-eyebrow">WARP</span>
        {warp.mine && <span className="hud-info-new">自分のワープホール</span>}
      </div>
      <div className="hud-title hud-code">{warp.code}</div>
      <div className="hud-small">ここから {formatDistance(warp.distanceKm)}</div>
      <ul className="hud-info-lines">
        <li className="hud-small">{warp.reading}</li>
      </ul>
      <div className="hud-info-actions">
        <button
          type="button"
          className="hud-button hud-button-small"
          onClick={() => {
            hudActions.warpTo(warp.id);
            hudActions.setOverlay(null);
          }}
        >
          ワープ
        </button>
        <button type="button" className="hud-button hud-button-small" onClick={() => hudActions.faceWarp(warp.id)}>
          その方を向く
        </button>
        <button type="button" className="hud-button hud-button-small hud-button-quiet" onClick={() => hudActions.selectWarp(null)}>
          選ぶのをやめる
        </button>
      </div>
    </div>
  );
}
