import { useEffect, useRef } from 'react';
import { MAP_LAYERS, type MapLayer, type RadarBlip } from '../world/radar';
import { formatDistance } from './format';
import { hudActions, hudStore } from './hud-store';
import { Radar } from './Radar';

/**
 * ホイール 1 目盛り（約 100）で、範囲を約 1.8 倍にする。トラックパッドのピンチ（Ctrl＋ホイール）は細かく届くので強める。
 * 目盛りは対数（ふちまで 7 桁）なので、倍率をそのまま使うと、手を大きく動かしても見た目がほとんど変わらない
 */
const WHEEL_RATE = 0.006;
const PINCH_WHEEL_RATE = 0.03;
/** 二本指の間の距離が 2 倍になると、範囲を 1/2³ = 1/8 にする（同じ理由で強める） */
const PINCH_GAIN = 3;

/**
 * 大きくしたマップ（M。2026-11-12）。画面の真ん中にレーダー、その下に出すものの切り替え。
 * - 範囲（ふちの距離）は、二本指で広げる・つまむ（PC はホイール・トラックパッドのピンチ）。閉じたあとの小さなレーダーも同じ範囲
 * - 出すものの種類も、閉じたあとの小さなレーダーにそのまま残る（この端末に覚えておく）
 * - 天体・恒星の点を押すとその天体を選び、ワープホールの点を押すとそのワープホールを選ぶ（どちらも上の真ん中にカード。
 *   ワープはワープホールのカードの「ワープ」から。下のボタンは、ワープホールを作るボタン）
 * 閉じるのは、まわりを押すか、M・Esc（× は置かない）
 */
export function MapPanel({
  blips,
  rangeKm,
  layers,
  selectedKey,
  selectedWarp,
  withCard = false,
}: {
  blips: RadarBlip[];
  rangeKm: number;
  layers: Record<MapLayer, boolean>;
  selectedKey: string | null;
  selectedWarp: string | null;
  /** 選んだ天体・ワープホールのカードが出ている（スマホでは、カードの場所を空けるためにレーダーを小さくする） */
  withCard?: boolean;
}) {
  const radarBox = useRef<HTMLDivElement>(null);
  usePinchZoom(radarBox);
  return (
    <div className={`hud-panel hud-map${withCard ? ' is-with-card' : ''}`} role="dialog" aria-label="マップ">
      <div className="hud-map-radar" ref={radarBox}>
        <div className="hud-map-head">
          <p className="hud-eyebrow">MAP</p>
          <span className="hud-map-range">半径 {formatDistance(rangeKm)}</span>
        </div>
        <Radar
          blips={blips}
          rangeKm={rangeKm}
          layers={layers}
          large
          selectedKey={selectedKey}
          selectedWarp={selectedWarp}
          onPickBody={(key) => hudActions.selectTarget(key === selectedKey ? null : key)}
          onPickWarp={(id) => hudActions.selectWarp(id === selectedWarp ? null : id)}
        />
      </div>
      <div className="hud-chips hud-map-layers" role="group" aria-label="マップに出すもの">
        {MAP_LAYERS.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`hud-chip${layers[l.id] ? ' is-selected' : ''}`}
            aria-pressed={layers[l.id]}
            onClick={() => hudActions.toggleMapLayer(l.id)}
          >
            {l.nameJa}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 二本指で範囲を変える（広げると狭い範囲を大きく、つまむと広い範囲を）。PC はホイールとトラックパッドのピンチ。
 * 範囲は、指の間の距離の比の 3 乗で変える（対数の目盛りなので、同じ比なら、どの範囲でも同じ手ざわりになる）
 */
function usePinchZoom(box: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let start: { dist: number; rangeKm: number } | null = null;
    /** 二本指を離した直後の指で、点を押したことにしない */
    let pinchedAt = -Infinity;
    const spread = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) start = { dist: Math.max(spread(), 1), rangeKm: hudStore.get().mapRangeKm };
    };
    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (start && pointers.size >= 2) {
        e.preventDefault();
        pinchedAt = performance.now();
        hudActions.setMapRange(start.rangeKm * (start.dist / Math.max(spread(), 1)) ** PINCH_GAIN);
      }
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) start = null;
    };
    const click = (e: MouseEvent) => {
      if (performance.now() - pinchedAt < 400) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      hudActions.setMapRange(hudStore.get().mapRangeKm * Math.exp(dy * (e.ctrlKey ? PINCH_WHEEL_RATE : WHEEL_RATE)));
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('click', click, true);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('click', click, true);
      el.removeEventListener('wheel', wheel);
    };
  }, [box]);
}
