import type { PointerEvent as ReactPointerEvent } from 'react';
import { hudActions, type MoveKeyCode } from './hud-store';

/**
 * スマホの操縦のボタン（要件 F60）。マインクラフト統合版のタッチ操作を真似た：
 * 左下に十字のボタン（前後左右）、右下に上昇・下降のボタン。前のボタンを 2 回すばやく押すとダッシュ。
 * 押している間だけ動く。ボタンを押しながら、別の指で画面をドラッグして向きを変えられる
 */
function HoldButton({ code, label, className }: { code: MoveKeyCode; label: string; className: string }) {
  const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    hudActions.setMoveKey(code, true);
  };
  const up = () => hudActions.setMoveKey(code, false);
  return (
    <button
      type="button"
      className={`hud-button hud-pad-button ${className}`}
      aria-label={label}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      {className.includes('is-arrow') ? ARROWS[code] : label}
    </button>
  );
}

const ARROWS: Partial<Record<MoveKeyCode, string>> = { KeyW: '▲', KeyA: '◀', KeyD: '▶', KeyS: '▼' };

export function TouchPad({ hidden }: { hidden: boolean }) {
  return (
    <div className="hud-touchpad" style={hidden ? { display: 'none' } : undefined}>
      <div className="hud-dpad" role="group" aria-label="前後左右">
        <HoldButton code="KeyW" label="前へ" className="is-arrow is-up" />
        <HoldButton code="KeyA" label="左へ" className="is-arrow is-left" />
        <HoldButton code="KeyD" label="右へ" className="is-arrow is-right" />
        <HoldButton code="KeyS" label="後ろへ" className="is-arrow is-down" />
      </div>
      <div className="hud-lift" role="group" aria-label="上昇・下降">
        <HoldButton code="Space" label="上昇" className="is-lift" />
        <HoldButton code="ShiftLeft" label="下降" className="is-lift" />
      </div>
    </div>
  );
}
