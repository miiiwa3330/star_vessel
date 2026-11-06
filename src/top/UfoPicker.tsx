import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { HULLS } from '../world/ship-design';
import type { TopStage } from './top-stage';
import { dragPosition, hullOfTarget, settleTarget, SPACING_OF_WIDTH } from './ufo-carousel';

/** この距離（px）以上動いたら、タップではなく、ドラッグ */
const DRAG_START_PX = 6;
/** 指の動きを覚える長さ（ms）。離したときの勢いを、この間の動きから決める */
const VELOCITY_WINDOW_MS = 110;
/** 横のスクロール（トラックパッド）で 1 つ送る間隔（ms） */
const WHEEL_GAP_MS = 380;
/** 箱が広がりきるまでの待ち（ms）。top.css の .top-ufos の高さの動きと合わせる。広がりきってから船を飛ばす */
const LAYOUT_MS = 560;

/**
 * 宇宙船を選ぶ列の、操作の部分（要件 F48）。船そのものは 3D（ufo-layer.ts）で描くので、ここは見えない。
 * 同じ場所に、横に 3 つの押せる範囲を置く：左右をタップ（またはキーボード）で隣の船へ、横に引く（スライド）で送る。
 * 3D が使えないときだけ、船の名前を文字で出す。
 */
export function UfoPicker({
  stage,
  active,
  target,
  onTarget,
  showNames,
}: {
  stage: TopStage;
  /** 船を選ぶ段階か */
  active: boolean;
  target: number;
  onTarget: (target: number) => void;
  showNames: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [laidOut, setLaidOut] = useState(false);
  // 箱の高さが広がりきるのを待ってから、3D の船に位置を教える（広がる間は、位置と大きさが変わり続けるため）
  useEffect(() => {
    if (!active) {
      setLaidOut(false);
      return;
    }
    const id = window.setTimeout(() => setLaidOut(true), LAYOUT_MS);
    return () => clearTimeout(id);
  }, [active]);
  useEffect(() => {
    stage.getRect = () => {
      const el = ref.current;
      if (!el || !laidOut) return null;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 8 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
    };
    return () => {
      stage.getRect = null;
    };
  }, [stage, laidOut]);

  const drag = useRef<{ x: number; pos: number; origin: number; moved: boolean; samples: { t: number; pos: number }[] } | null>(null);
  /** ドラッグのあとに出る click を、タップとして扱わない */
  const swallowClick = useRef(false);
  const lastWheel = useRef(0);

  const spacing = () => (ref.current?.getBoundingClientRect().width ?? 300) * SPACING_OF_WIDTH;

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!active || stage.ufoBusy || e.button > 0) return;
    drag.current = { x: e.clientX, pos: stage.pos, origin: stage.target, moved: false, samples: [] };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved) {
      if (Math.abs(dx) < DRAG_START_PX) return;
      d.moved = true;
      // 引いている間は、押した箱ではなく、この箱が指の動きを受ける
      ref.current?.setPointerCapture(e.pointerId);
    }
    const pos = dragPosition(d.pos, dx, spacing());
    stage.dragPos = pos;
    const now = performance.now();
    d.samples.push({ t: now, pos });
    while (d.samples.length > 2 && now - d.samples[0].t > VELOCITY_WINDOW_MS) d.samples.shift();
  };
  const endDrag = useCallback(
    (e: ReactPointerEvent) => {
      const d = drag.current;
      drag.current = null;
      if (!d?.moved) return;
      if (ref.current?.hasPointerCapture(e.pointerId)) ref.current.releasePointerCapture(e.pointerId);
      swallowClick.current = true;
      setTimeout(() => (swallowClick.current = false), 0);
      const first = d.samples[0];
      const last = d.samples[d.samples.length - 1];
      const velocity = first && last && last.t > first.t ? ((last.pos - first.pos) / (last.t - first.t)) * 1000 : 0;
      const pos = stage.dragPos ?? stage.pos;
      const next = settleTarget(pos, velocity, d.origin);
      // 先に目標を置いてから、ドラッグを終える（間に 1 フレーム、古い目標へ戻らないように）
      stage.target = next;
      stage.dragPos = null;
      onTarget(next);
    },
    [stage, onTarget],
  );

  const step = (delta: number) => {
    if (!active || stage.ufoBusy) return;
    const next = target + delta;
    stage.target = next;
    onTarget(next);
  };
  const onWheel = (e: ReactWheelEvent) => {
    if (!active || Math.abs(e.deltaX) < Math.abs(e.deltaY) || Math.abs(e.deltaX) < 12) return;
    const now = performance.now();
    if (now - lastWheel.current < WHEEL_GAP_MS) return;
    lastWheel.current = now;
    step(e.deltaX > 0 ? 1 : -1);
  };

  const slots = [-1, 0, 1] as const;
  return (
    <div
      ref={ref}
      className={`top-ufos${active ? ' is-open' : ''}`}
      role="radiogroup"
      aria-label="宇宙船"
      aria-hidden={!active}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={onWheel}
    >
      {slots.map((slot) => {
        const hull = hullOfTarget(target + slot);
        return (
          <button
            key={slot}
            type="button"
            role="radio"
            aria-checked={slot === 0}
            aria-label={HULLS[hull].nameJa}
            title={HULLS[hull].nameJa}
            tabIndex={active ? 0 : -1}
            className={`top-ufo-zone is-${slot < 0 ? 'left' : slot > 0 ? 'right' : 'center'}`}
            onClick={() => {
              if (swallowClick.current) return;
              step(slot);
            }}
          >
            {showNames && <span className="top-ufo-name">{HULLS[hull].nameJa}</span>}
          </button>
        );
      })}
    </div>
  );
}

