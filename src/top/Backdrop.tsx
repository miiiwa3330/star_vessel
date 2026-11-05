import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { mulberry32 } from '../world/random';

// 3D の地球は three.js と画像を読み込むので大きい。画面が出てから、遅れて読み込む
const EarthCanvas = lazy(() => import('./EarthCanvas'));

/** 画面が出てから、3D の地球を読み込み始めるまでの待ち（ms） */
const EARTH_DELAY_MS = 250;

/**
 * 3D の地球を使うか。通信量を節約する設定（Save-Data）のときと、URL に ?earth=css があるとき（確かめ用）は使わず、CSS の縁のままにする
 */
export function wantsEarth3d(): boolean {
  if (new URLSearchParams(location.search).get('earth') === 'css') return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !conn?.saveData;
}

/** 星の数の目安：画面の面積 ÷ この値 */
const PX2_PER_STAR = 3600;
const MIN_STARS = 120;
const MAX_STARS = 600;

interface Star {
  x: number;
  y: number;
  /** 手前ほど 1 に近い。大きく、明るく、速く流れる */
  depth: number;
  phase: number;
  hue: number;
}

/** 星の並び。種が同じなら、いつも同じ（誰の端末でも同じ夜空になる） */
export function makeStars(count: number, seed = 20261106): Star[] {
  const rand = mulberry32(seed);
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const depth = rand() ** 2.2;
    stars.push({ x: rand(), y: rand(), depth, phase: rand() * Math.PI * 2, hue: 200 + rand() * 60 - (rand() < 0.15 ? 170 : 0) });
  }
  return stars;
}

/**
 * タイトル画面と準備画面の背景。星空（2D の canvas）と、画面の下に見える地球の縁（CSS）。
 * 世界の描画（three.js）は使わない。軽く開くため（要件 F48）。
 * 動きは、星のゆっくりした流れとまたたきだけ。「動きを減らす」の設定では止める。
 */
export function Backdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [load3d, setLoad3d] = useState(false);
  const [ready3d, setReady3d] = useState(false);
  const onReady = useCallback(() => setReady3d(true), []);

  useEffect(() => {
    if (!wantsEarth3d()) return;
    const id = window.setTimeout(() => setLoad3d(true), EARTH_DELAY_MS);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let stars: Star[] = [];
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      stars = makeStars(Math.min(MAX_STARS, Math.max(MIN_STARS, Math.round((w * h) / PX2_PER_STAR))));
      draw(performance.now());
    };

    const draw = (now: number) => {
      const t = reduce.matches ? 0 : now / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const flow = (t * (1.5 + 7 * s.depth)) % w;
        const x = (((s.x * w - flow) % w) + w) % w;
        const y = s.y * h;
        const twinkle = reduce.matches ? 1 : 0.75 + 0.25 * Math.sin(t * (0.6 + s.depth * 1.4) + s.phase);
        const alpha = (0.25 + 0.7 * s.depth) * twinkle;
        const r = 0.35 + 1.25 * s.depth;
        ctx.fillStyle = `hsla(${s.hue}, 70%, ${80 + 15 * s.depth}%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = (now: number) => {
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      if (!reduce.matches && !document.hidden) raf = requestAnimationFrame(loop);
    };

    resize();
    start();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', start);
    reduce.addEventListener('change', start);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', start);
      reduce.removeEventListener('change', start);
    };
  }, []);

  return (
    <div className={`top-backdrop${ready3d ? ' is-3d' : ''}`} aria-hidden="true">
      <canvas ref={ref} className="top-stars" />
      {/* 3D の地球が描けるまでは、この CSS の縁を出す。描けたら入れ替える */}
      <div className="top-earth" />
      {load3d && (
        <Suspense fallback={null}>
          <EarthCanvas onReady={onReady} />
        </Suspense>
      )}
    </div>
  );
}
