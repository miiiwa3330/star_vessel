import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { hudActions, type MoveKeyCode } from './hud-store';
import { speedFraction, speedSteps, stickKeys, stickKnob, type StickKey } from '../controls/touch-stick';
import { MAX_SPEED_KM_S, MIN_SPEED_KM_S } from '../world/ship-schema';
import { formatSpeed } from './format';

/** パッドの半径（px）。指をここまで動かすと、いちばん倒したことになる */
const STICK_RADIUS_PX = 46;

/**
 * スマホの操縦（要件 F60。2026-11-21 にオーナーの指示で作り直した）。
 * - 画面の下の真ん中に、バーチャルパッド（指で倒した向きに前後左右・斜めへ進む。端まで倒すとダッシュ）
 * - 画面の右に、速さのバー（上が＋・下が−。上へスワイプで速く、下へスワイプで遅く。軽く押すと 1 段ずつ）
 * 上昇・下降のボタンは、いったん無くした（オーナーの指示）。
 * どちらも押している指だけを追うので、別の指で画面をドラッグして向きを変えられる。計算は src/controls/touch-stick.ts
 */
export function TouchPad({ hidden, speedKmS }: { hidden: boolean; speedKmS: number }) {
  return (
    <div className="hud-touchpad" style={hidden ? { display: 'none' } : undefined}>
      <Stick />
      <SpeedBar speedKmS={speedKmS} />
    </div>
  );
}

/** バーチャルパッド */
function Stick() {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const held = useRef(new Set<StickKey>());
  const center = useRef({ x: 0, y: 0 });
  const apply = (next: Set<StickKey>) => {
    for (const k of held.current) if (!next.has(k)) hudActions.setMoveKey(k as MoveKeyCode, false);
    for (const k of next) if (!held.current.has(k)) hudActions.setMoveKey(k as MoveKeyCode, true);
    held.current = next;
  };
  const move = (clientX: number, clientY: number) => {
    const x = (clientX - center.current.x) / STICK_RADIUS_PX;
    const y = (clientY - center.current.y) / STICK_RADIUS_PX;
    setKnob(stickKnob(x, y));
    apply(stickKeys(x, y));
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    center.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    move(e.clientX, e.clientY);
  };
  const up = () => {
    setKnob({ x: 0, y: 0 });
    apply(new Set());
  };
  return (
    <div
      className={`hud-stick${held.current.size > 0 ? ' is-active' : ''}`}
      role="application"
      aria-label="移動のパッド（倒した向きに進む。端まで倒すとダッシュ）"
      onPointerDown={down}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e.clientX, e.clientY);
      }}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="hud-stick-knob" style={{ transform: `translate(${knob.x * STICK_RADIUS_PX}px, ${knob.y * STICK_RADIUS_PX}px)` }} />
    </div>
  );
}

/** 速さのバー（上が＋・下が−） */
function SpeedBar({ speedKmS }: { speedKmS: number }) {
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ y: 0, carry: 0, moved: 0, startY: 0, top: 0, height: 1 });
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { y: e.clientY, carry: 0, moved: 0, startY: e.clientY, top: r.top, height: r.height };
    setDragging(true);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const d = drag.current;
    const r = speedSteps(d.carry, e.clientY - d.y);
    d.y = e.clientY;
    d.carry = r.carryPx;
    d.moved = Math.max(d.moved, Math.abs(e.clientY - d.startY));
    if (r.steps !== 0) hudActions.changeSpeed(r.steps);
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    // ほとんど動かさずに離したら、押した場所で 1 段（上半分は＋、下半分は−）
    if (e.type === 'pointerup' && d.moved < 6) hudActions.changeSpeed(d.startY < d.top + d.height / 2 ? 1 : -1);
    setDragging(false);
  };
  const f = speedFraction(speedKmS, MIN_SPEED_KM_S, MAX_SPEED_KM_S);
  return (
    <div
      className={`hud-speedbar${dragging ? ' is-dragging' : ''}`}
      role="slider"
      aria-label="速さ（上へスワイプで速く、下へスワイプで遅く）"
      aria-valuetext={formatSpeed(speedKmS)}
      aria-valuenow={Math.round(f * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="hud-speedbar-mark is-plus" aria-hidden="true">
        ＋
      </span>
      <div className="hud-speedbar-track" aria-hidden="true">
        <div className="hud-speedbar-fill" style={{ height: `${f * 100}%` }} />
      </div>
      <span className="hud-speedbar-mark is-minus" aria-hidden="true">
        −
      </span>
      {dragging && <span className="hud-speedbar-value">{formatSpeed(speedKmS)}</span>}
    </div>
  );
}
