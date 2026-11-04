import { HULL_TYPES, HULLS } from '../world/ship-design';
import { hudActions, type ShipBuilderState } from './hud-store';

/**
 * 宇宙船を作る画面（要件 F27）。いまは 3 種類の船体から選ぶ。
 * 開いている間は、選んだ船を三人称の視点でゆっくり回して見せる（main.ts）。
 */
export function ShipBuilder({ state }: { state: ShipBuilderState }) {
  return (
    <div className="hud-panel hud-ship-builder" role="dialog" aria-label="宇宙船を作る">
      <div className="hud-title">{state.firstTime ? 'あなたの宇宙船を選んでください' : '宇宙船を変える'}</div>
      <div className="hud-muted hud-small">色はプレイヤーごとに決まります。形はあとから何度でも変えられます</div>
      <div className="hud-ship-options" role="radiogroup" aria-label="船体">
        {HULL_TYPES.map((hull) => (
          <button
            key={hull}
            type="button"
            role="radio"
            aria-checked={state.hull === hull}
            className={`hud-ship-option${state.hull === hull ? ' is-selected' : ''}`}
            onClick={() => hudActions.previewHull(hull)}
          >
            <span className="hud-ship-option-name">{HULLS[hull].nameJa}</span>
            <span className="hud-muted hud-small">{HULLS[hull].descriptionJa}</span>
          </button>
        ))}
      </div>
      <div className="hud-ship-actions">
        <button type="button" className="hud-button" disabled={state.saving} onClick={() => hudActions.saveShip()}>
          {state.saving ? '保存しています…' : 'この船にする'}
        </button>
        <button type="button" className="hud-button" disabled={state.saving} onClick={() => hudActions.closeShipBuilder()}>
          {state.firstTime ? 'あとで（いまの船で始める）' : 'やめる'}
        </button>
      </div>
    </div>
  );
}
