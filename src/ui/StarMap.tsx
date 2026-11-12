import { useEffect, useRef, useState } from 'react';
import { INFO_KIND_NAMES_JA, type InfoKind } from '../world/info';
import {
  clampMapView,
  fitMapDistance,
  mapCamera,
  mapPosition,
  mapRadius,
  mapRings,
  type MapView,
} from '../world/star-map';
import { length, sub, type Vec3 } from '../world/vec';
import { formatDistance } from './format';
import type { MapPoint } from './hud-store';

/** 点の色（レーダーと同じ：天体は白っぽい青、恒星は黄色。星団・星雲・銀河は紫、人工の物は緑） */
const KIND_COLOR: Partial<Record<InfoKind, string>> & { default: string } = {
  default: '#d9e2ff',
  star: '#ffd59a',
  'white-dwarf': '#cfe0ff',
  'neutron-star': '#a9c4ff',
  'black-hole': '#ff9a4a',
  cluster: '#d6b3ff',
  nebula: '#ff9ad6',
  galaxy: '#c2b0ff',
  satellite: '#8dffb0',
  spacecraft: '#8dffb0',
};
const SELF_COLOR = '#ff8a1f';
/** 真ん中を変えたときに、動いて見える時間（ミリ秒） */
const FOCUS_MS = 700;
/** 押して選べる、画面の上での距離（CSS ピクセル） */
const PICK_PX = 26;
const ROTATE_PER_PX = 0.006;
const WHEEL_RATE = 0.0015;

/**
 * 3D のマップ（要件 F62。2026-11-12 にオーナーの指示）。**訪れた場所だけが出て、訪れるほど少しずつ解放される**。
 * 距離は真ん中からの対数（src/world/star-map.ts）。ドラッグで回し、二本指・ホイールで寄る・離れる。
 * 点を押すと、その場所を選んで真ん中にする。描くのは 2D の canvas（宇宙の描画とは別。開いている間だけ描く）
 */
export function StarMap({ points, selfKm, focusKey }: { points: MapPoint[]; selfKm: Vec3; focusKey: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<string | null>(focusKey && points.some((p) => p.key === focusKey) ? focusKey : null);
  const data = useRef({ points, selfKm, selected });
  data.current = { points, selfKm, selected };
  const view = useRef<MapView | null>(null);
  /** 真ん中の移り変わり（前の真ん中から、いまの真ん中へ） */
  const focus = useRef<{ from: Vec3; to: Vec3; at: number } | null>(null);

  const focusOf = (key: string | null): Vec3 => data.current.points.find((p) => p.key === key)?.positionKm ?? data.current.selfKm;

  // 真ん中を変える
  useEffect(() => {
    const to = focusOf(selected);
    const f = focus.current;
    if (!f) {
      focus.current = { from: to, to, at: 0 };
      return;
    }
    const now = performance.now();
    focus.current = { from: currentFocus(f, now), to, at: now };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const { points: pts, selfKm: self, selected: sel } = data.current;
      const f = focus.current ?? { from: self, to: self, at: 0 };
      // いまの真ん中は、選んだ場所の最新の位置（惑星は動くので）
      f.to = focusOf(sel);
      const t = reduce ? 1 : Math.min(1, (now - f.at) / FOCUS_MS);
      const e = t < 1 ? 1 - (1 - t) ** 3 : 1;
      const place = (km: Vec3): Vec3 => {
        const b = mapPosition(km, f.to);
        if (e >= 1) return b;
        const a = mapPosition(km, f.from);
        return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, z: a.z + (b.z - a.z) * e };
      };
      const placed = pts.map((p) => ({ p, m: place(p.positionKm) }));
      const selfM = place(self);
      const maxR = Math.max(mapRadius(1e5), length(selfM), ...placed.map((x) => length(x.m)));
      if (!view.current) view.current = { yaw: -Math.PI / 2 + 0.5, pitch: 0.55, distance: fitMapDistance(maxR) };
      const project = mapCamera(view.current, w, h);

      // 目盛りの円（黄道面）。真ん中のまわり
      ctx.lineWidth = 1;
      ctx.font = '10px "Josefin Sans", system-ui, sans-serif';
      for (const ring of mapRings(maxR)) {
        ctx.beginPath();
        let started = false;
        for (let i = 0; i <= 96; i++) {
          const a = (i / 96) * 2 * Math.PI;
          const q = project({ x: ring.r * Math.cos(a), y: ring.r * Math.sin(a), z: 0 });
          if (!q.visible) {
            started = false;
            continue;
          }
          if (started) ctx.lineTo(q.x, q.y);
          else ctx.moveTo(q.x, q.y);
          started = true;
        }
        ctx.strokeStyle = 'rgba(160, 190, 255, 0.16)';
        ctx.stroke();
        // 名前は、カメラに近い側
        const yaw = view.current.yaw;
        const lq = project({ x: ring.r * Math.cos(yaw), y: ring.r * Math.sin(yaw), z: 0 });
        if (lq.visible) {
          ctx.fillStyle = 'rgba(190, 210, 255, 0.45)';
          ctx.fillText(formatDistance(ring.km), lq.x + 4, lq.y + 12);
        }
      }

      // 点：遠いものから描く（近いものが上に重なる）
      const drawn = placed
        .map(({ p, m }) => ({ p, m, q: project(m), foot: project({ x: m.x, y: m.y, z: 0 }) }))
        .filter((d) => d.q.visible)
        .sort((a, b) => b.q.depth - a.q.depth);
      const scaleAt = (depth: number) => Math.min(1.8, Math.max(0.55, view.current!.distance / depth));
      for (const d of drawn) {
        const color = KIND_COLOR[d.p.kind] ?? KIND_COLOR.default;
        const s = scaleAt(d.q.depth);
        // 平面へ下ろす線（高さが分かるように）
        if (d.foot.visible) {
          ctx.strokeStyle = 'rgba(160, 190, 255, 0.22)';
          ctx.beginPath();
          ctx.moveTo(d.q.x, d.q.y);
          ctx.lineTo(d.foot.x, d.foot.y);
          ctx.stroke();
          ctx.fillStyle = 'rgba(160, 190, 255, 0.35)';
          ctx.fillRect(d.foot.x - 1, d.foot.y - 1, 2, 2);
        }
        // 解放された場所のにじみ
        const glow = ctx.createRadialGradient(d.q.x, d.q.y, 0, d.q.x, d.q.y, 22 * s);
        glow.addColorStop(0, hexA(color, 0.28));
        glow.addColorStop(1, hexA(color, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(d.q.x, d.q.y, 22 * s, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(d.q.x, d.q.y, 3.2 * s, 0, 2 * Math.PI);
        ctx.fill();
        if (d.p.key === sel) {
          ctx.strokeStyle = SELF_COLOR;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(d.q.x, d.q.y, 10, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.lineWidth = 1;
        }
      }

      // 自分（オレンジの三角）
      const sq = project(selfM);
      if (sq.visible) {
        ctx.fillStyle = SELF_COLOR;
        ctx.beginPath();
        ctx.moveTo(sq.x, sq.y - 7);
        ctx.lineTo(sq.x + 6, sq.y + 5);
        ctx.lineTo(sq.x - 6, sq.y + 5);
        ctx.closePath();
        ctx.fill();
      }

      // 名前：選んだもの・自分を先に、重ならないものだけ、近いものから
      ctx.font = '12px "Josefin Sans", system-ui, sans-serif';
      const boxes: { x: number; y: number; w: number; h: number }[] = [];
      const label = (text: string, x: number, y: number, color: string) => {
        const tw = ctx.measureText(text).width;
        const b = { x: x + 8, y: y - 8, w: tw, h: 14 };
        if (b.x + b.w > w - 4 || b.y < 2 || b.y + b.h > h - 2) return;
        if (boxes.some((o) => b.x < o.x + o.w + 4 && o.x < b.x + b.w + 4 && b.y < o.y + o.h && o.y < b.y + b.h)) return;
        boxes.push(b);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(2, 4, 10, 0.85)';
        ctx.strokeText(text, b.x, y + 4);
        ctx.fillStyle = color;
        ctx.fillText(text, b.x, y + 4);
        ctx.lineWidth = 1;
      };
      const selD = drawn.find((d) => d.p.key === sel);
      if (selD) label(selD.p.name, selD.q.x, selD.q.y, '#fff');
      if (sq.visible) label('YOU', sq.x, sq.y, SELF_COLOR);
      for (const d of [...drawn].reverse()) if (d !== selD) label(d.p.name, d.q.x, d.q.y, KIND_COLOR[d.p.kind] ?? KIND_COLOR.default);
      lastDrawn.current = drawn.map((d) => ({ key: d.p.key, x: d.q.x, y: d.q.y }));
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastDrawn = useRef<{ key: string; x: number; y: number }[]>([]);
  useMapGestures(canvasRef, view, (x, y) => {
    let best: string | null = null;
    let bestD = PICK_PX;
    for (const d of lastDrawn.current) {
      const dd = Math.hypot(d.x - x, d.y - y);
      if (dd < bestD) {
        bestD = dd;
        best = d.key;
      }
    }
    if (best) setSelected(best);
  });

  const sel = points.find((p) => p.key === selected) ?? null;
  return (
    <div className="hud-panel hud-glass-panel hud-starmap" role="dialog" aria-label="マップ">
      <div className="hud-starmap-head">
        <p className="hud-eyebrow">
          MAP<span className="hud-count">{points.length}</span>
        </p>
      </div>
      <canvas ref={canvasRef} className="hud-starmap-canvas" />
      <div className="hud-starmap-foot">
        {sel ? (
          <div className="hud-starmap-info">
            <span className="hud-starmap-name">{sel.name}</span>
            <span className="hud-small hud-muted">
              {INFO_KIND_NAMES_JA[sel.kind]} ・ ここから {formatDistance(length(sub(sel.positionKm, selfKm)))}
            </span>
          </div>
        ) : (
          <div className="hud-starmap-info">
            <span className="hud-small hud-muted">訪れた場所 {points.length}</span>
          </div>
        )}
        {sel && (
          <button type="button" className="hud-button hud-button-small" onClick={() => setSelected(null)}>
            自分を真ん中に
          </button>
        )}
      </div>
    </div>
  );
}

function currentFocus(f: { from: Vec3; to: Vec3; at: number }, now: number): Vec3 {
  // 動いている途中で変えたら、今の位置から（km で混ぜると桁が大きく違うので、近い方にする）
  return now - f.at < FOCUS_MS / 2 ? f.from : f.to;
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** ドラッグで回す・二本指（PC はホイール）で寄る・離れる・押して選ぶ */
function useMapGestures(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  view: React.RefObject<MapView | null>,
  onTap: (x: number, y: number) => void,
) {
  const tap = useRef(onTap);
  tap.current = onTap;
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let press: { x: number; y: number; moved: number } | null = null;
    let pinch: { dist: number; distance: number } | null = null;
    const spread = () => {
      const [a, b] = [...pointers.values()];
      return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    };
    const set = (v: Partial<MapView>) => {
      if (view.current) view.current = clampMapView({ ...view.current, ...v });
    };
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) press = { x: e.clientX, y: e.clientY, moved: 0 };
      if (pointers.size === 2 && view.current) {
        pinch = { dist: spread(), distance: view.current.distance };
        press = null;
      }
    };
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev || !view.current) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size >= 2) {
        set({ distance: pinch.distance * (pinch.dist / spread()) });
        return;
      }
      if (press) press.moved += Math.abs(dx) + Math.abs(dy);
      set({ yaw: view.current.yaw - dx * ROTATE_PER_PX, pitch: view.current.pitch + dy * ROTATE_PER_PX });
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (press && pointers.size === 0 && e.type === 'pointerup' && press.moved < 6) {
        const r = el.getBoundingClientRect();
        tap.current(e.clientX - r.left, e.clientY - r.top);
      }
      if (pointers.size === 0) press = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!view.current) return;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      set({ distance: view.current.distance * Math.exp(dy * WHEEL_RATE * (e.ctrlKey ? 4 : 1)) });
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [canvasRef, view]);
}
