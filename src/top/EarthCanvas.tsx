import { useEffect, useRef } from 'react';
import { fetchEarthShips } from '../net/earth-ships';
import { SHOWCASE_REFRESH_MS } from '../world/earth-ships-schema';
import { EarthScene } from './earth-scene';

/**
 * タイトル画面と準備画面の背景の、3D の地球（src/top/earth-scene.ts）。three.js と画像を読み込むので、
 * 画面が出てから、遅れて読み込む（Backdrop の lazy）。描けたら onReady を呼び、いまの背景（CSS の縁）と入れ替える。
 * 描けない環境では、onReady を呼ばずに終わる（いまの背景のまま）。画面が見えていない間は止める。
 */
export default function EarthCanvas({ onReady }: { onReady: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let scene: EarthScene | null = null;
    let disposed = false;
    let raf = 0;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    // スマホ（指で操作する端末）は、電池のため 1 秒に約 30 回までにする
    const minGapMs = window.matchMedia('(pointer: coarse)').matches ? 30 : 0;
    let lastDrawMs = 0;
    // 世界の時刻と同じく、いまの本物の時刻で描く
    const frame = () => {
      const now = Date.now();
      if (now - lastDrawMs >= minGapMs) {
        lastDrawMs = now;
        scene?.render(now, !reduce.matches);
      }
      // 「動きを減らす」のときは、1 秒に 1 回だけ描き直す（夜の灯りと境目は、本物の時間で、ゆっくり動く）
      if (!disposed && !document.hidden) raf = reduce.matches ? window.setTimeout(frame, 1000) : requestAnimationFrame(frame);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      clearTimeout(raf);
      clearTimeout(pollTimer);
      if (scene && !document.hidden) {
        frame();
        void poll();
      }
    };
    // 地球のまわりの船の位置（タイトル画面の背景）を、サーバーの覚えている間隔で読み直す。画面が見えていない間は読まない
    let pollTimer = 0;
    const poll = async () => {
      if (disposed || document.hidden) return;
      const snap = await fetchEarthShips();
      if (snap && !disposed) scene?.ingestShips(snap, Date.now());
      if (!disposed) pollTimer = window.setTimeout(() => void poll(), SHOWCASE_REFRESH_MS);
    };
    const resize = () => scene?.setSize(canvas.clientWidth, canvas.clientHeight, Math.min(window.devicePixelRatio || 1, 1.5));

    EarthScene.create(canvas)
      .then((s) => {
        if (disposed) {
          s.dispose();
          return;
        }
        scene = s;
        // 開発サーバーのときだけ：描いている物を、開発者ツールから読めるようにする（確かめ用。本番のビルドには入らない）
        if (import.meta.env.DEV) (window as unknown as { __earth?: EarthScene }).__earth = s;
        resize();
        frame();
        void poll();
        onReady();
      })
      .catch((e: unknown) => console.warn('地球を 3D で描けない。いまの背景のままにする', e));

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    document.addEventListener('visibilitychange', start);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      clearTimeout(raf);
      clearTimeout(pollTimer);
      ro.disconnect();
      document.removeEventListener('visibilitychange', start);
      scene?.dispose();
    };
  }, [onReady]);

  return <canvas ref={ref} className="top-earth-canvas" />;
}
