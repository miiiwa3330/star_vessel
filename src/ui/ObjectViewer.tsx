import { forwardRef, useEffect, useRef, useState } from 'react';
import { globeExtent, renderGlobe, type CloudPoint, type GlobeOptions, type SurfaceMap } from './globe-render';
import { drawCloud, initialPitch, INITIAL_YAW, isCloudLook, makeCloud } from './cloud-picture';
import { globeMap, type CollectionLook } from './collection-look';
import { CraftIcon } from './BodyGlobe';
import { drawConstellation, drawConstellationArt } from './constellation-picture';

/** ドラッグ 1 px で回る角度・ひとりでに回る速さ（ラジアン/秒）・止まるまでの速さの減り方 */
const ROTATE_PER_PX = 0.012;
const AUTO_SPIN = 0.22;
const DAMPING = 3.2;
const PITCH_LIMIT = 1.45;

/**
 * 図鑑の詳細の天体（2026-11-12。要件 F38）。**ドラッグ（スマホは指）でくるくる回せる**。離すと少し滑ってから、ゆっくりひとりでに回る。
 * 球の天体・恒星・ブラックホールは globe-render の 1 画素ずつの絵、星団・銀河・星雲・彗星は 3D の点の集まり、人工の物は線の絵を CSS で回す。
 * unknown：まだ訪れていない天体（黒いシルエット）
 */
export const ObjectViewer = forwardRef<HTMLDivElement, { look: CollectionLook; size: number; unknown?: boolean }>(function ObjectViewer(props, ref) {
  // 星座は回さない（地球から見た空の図）。押すと絵が重なる
  if (props.look.type === 'constellation') return <ConstellationViewer ref={ref} look={props.look} size={props.size} unknown={props.unknown ?? false} />;
  return <SpinViewer ref={ref} {...props} />;
});

/**
 * 星座の詳細の絵（2026-11-13）：地球から見た線と星（北が上・東が左）。**押すと、星座の絵が重なる**（もう一度押すと消える）。
 * 絵は Stellarium の星座の絵。まだ集めていない星座では、絵は出さない
 */
const ConstellationViewer = forwardRef<HTMLDivElement, { look: Extract<CollectionLook, { type: 'constellation' }>; size: number; unknown: boolean }>(
  function ConstellationViewer({ look, size, unknown }, ref) {
    const linesRef = useRef<HTMLCanvasElement>(null);
    const artRef = useRef<HTMLCanvasElement>(null);
    const [artOn, setArtOn] = useState(false);
    const [artReady, setArtReady] = useState(false);
    const res = Math.round(size * Math.min(window.devicePixelRatio || 1, 2));
    const art = unknown ? null : look.art;
    useEffect(() => {
      const ctx = linesRef.current?.getContext('2d');
      if (ctx) drawConstellation(ctx, res, look.figure, unknown);
    }, [look, res, unknown]);
    // 絵は、はじめて押したときに読み込む
    useEffect(() => {
      if (!artOn || !art || artReady) return;
      let alive = true;
      const img = new Image();
      img.onload = () => {
        const ctx = artRef.current?.getContext('2d');
        if (!alive || !ctx) return;
        drawConstellationArt(ctx, res, img, art.transform);
        setArtReady(true);
      };
      img.src = art.url;
      return () => {
        alive = false;
      };
    }, [artOn, art, artReady, res]);
    const style = { width: size, height: size };
    return (
      <div
        ref={ref}
        className={`ov ov-constellation${unknown ? ' is-unknown' : ''}${art ? ' has-art' : ''}`}
        style={style}
        role={art ? 'button' : 'img'}
        tabIndex={art ? 0 : undefined}
        aria-pressed={art ? artOn : undefined}
        aria-label={art ? '星座の絵を重ねる' : '星座の図'}
        onClick={() => art && setArtOn((v) => !v)}
        onKeyDown={(e) => {
          if (art && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setArtOn((v) => !v);
          }
        }}
      >
        <canvas ref={artRef} width={res} height={res} className={`ov-constellation-art${artOn && artReady ? ' is-on' : ''}`} style={style} />
        <canvas ref={linesRef} width={res} height={res} className="ov-canvas ov-constellation-lines" style={style} />
      </div>
    );
  },
);

const SpinViewer = forwardRef<HTMLDivElement, { look: CollectionLook; size: number; unknown?: boolean }>(function SpinViewer(
  { look, size, unknown = false },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const craftRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const state = { yaw: INITIAL_YAW, pitch: initialPitch(look), vy: 0, vp: 0, dragging: false, dirty: true };
    let map: SurfaceMap | null = null;
    let cloud: CloudPoint[] | null = null;
    let alive = true;
    if (look.type === 'globe' || look.type === 'star') {
      if (!unknown) void globeMap(look).then((m) => {
        if (!alive) return;
        map = m;
        state.dirty = true;
      });
    } else if (isCloudLook(look)) cloud = makeCloud(look);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d') ?? null;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    // 1 画素ずつ描く球は、重さを抑えるため、少し粗く描いて広げる
    const res = Math.round(size * (cloud ? dpr : Math.min(dpr, 1.25)));
    let image: ImageData | null = null;
    if (canvas && ctx) {
      canvas.width = res;
      canvas.height = res;
      if (!cloud) image = ctx.createImageData(res, res);
    }
    const globeOpts = (): GlobeOptions => {
      if (look.type === 'star') return { yaw: state.yaw, pitch: state.pitch, emissive: true, color: look.color };
      if (look.type === 'black-hole')
        return { yaw: state.yaw, pitch: state.pitch, color: [0, 0, 0], emissive: true, ring: { inner: 1.6, outer: 4.4, color: [255, 160, 70], alpha: 0.95, emissive: true } };
      if (look.type === 'globe')
        return { yaw: state.yaw, pitch: state.pitch, color: [120, 120, 120], atmosphere: look.atmosphere, ring: look.ring };
      return { yaw: state.yaw, pitch: state.pitch };
    };
    const draw = () => {
      if (craftRef.current) {
        craftRef.current.style.transform = `rotateX(${-state.pitch}rad) rotateY(${state.yaw}rad)`;
        return;
      }
      if (!ctx) return;
      if (image) {
        renderGlobe(image.data, res, unknown ? null : map, unknown ? { ...globeOpts(), color: [0, 0, 0], atmosphere: undefined } : globeOpts());
        ctx.putImageData(image, 0, 0);
        return;
      }
      if (cloud) drawCloud(ctx, res, cloud, state.yaw, state.pitch, { unknown });
    };

    // ドラッグで回す
    let last: { x: number; y: number; t: number } | null = null;
    const down = (e: PointerEvent) => {
      box.setPointerCapture(e.pointerId);
      state.dragging = true;
      state.vy = 0;
      state.vp = 0;
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const move = (e: PointerEvent) => {
      if (!state.dragging || !last) return;
      const now = performance.now();
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      const dt = Math.max(1, now - last.t) / 1000;
      state.yaw += dx * ROTATE_PER_PX;
      state.pitch = clamp(state.pitch + dy * ROTATE_PER_PX, -PITCH_LIMIT, PITCH_LIMIT);
      state.vy = (dx * ROTATE_PER_PX) / dt;
      state.vp = (dy * ROTATE_PER_PX) / dt;
      state.dirty = true;
      last = { x: e.clientX, y: e.clientY, t: now };
    };
    const up = () => {
      state.dragging = false;
      last = null;
    };
    box.addEventListener('pointerdown', down);
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);

    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      if (!state.dragging) {
        const k = Math.exp(-DAMPING * dt);
        state.vy *= k;
        state.vp *= k;
        const auto = reduce ? 0 : AUTO_SPIN;
        // 滑りが弱まったら、ひとりでにゆっくり回る
        const spin = Math.abs(state.vy) > auto ? state.vy : state.vy + (auto - state.vy) * (1 - k);
        state.vy = spin;
        if (Math.abs(state.vy) > 1e-3 || Math.abs(state.vp) > 1e-3) {
          state.yaw += state.vy * dt;
          state.pitch = clamp(state.pitch + state.vp * dt, -PITCH_LIMIT, PITCH_LIMIT);
          state.dirty = true;
        }
      }
      if (state.dirty) {
        state.dirty = false;
        draw();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      box.removeEventListener('pointerdown', down);
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', up);
      box.removeEventListener('pointercancel', up);
    };
  }, [look, size, unknown]);

  const ext = look.type === 'globe' ? globeExtent({ ring: look.ring, atmosphere: look.atmosphere }) : look.type === 'black-hole' ? 4.5 : 1;
  return (
    <div
      ref={(el) => {
        boxRef.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      className={`ov ov-${look.type}${unknown ? ' is-unknown' : ''}`}
      style={{
        width: size,
        height: size,
        ['--ov-ext' as string]: ext,
        ...(look.type === 'star'
          ? {
              ['--ov-glow' as string]: `rgba(${look.color.map(Math.round).join(', ')}, ${(0.35 + 0.45 * look.picture.glow).toFixed(2)})`,
              ['--ov-star-size' as string]: look.picture.size,
              // 光の広がり（縮めた分を戻して、画面の上で同じ幅になるように）
              ['--ov-glow-px' as string]: `${((6 + 30 * look.picture.glow) / look.picture.size).toFixed(1)}px`,
            }
          : {}),
      }}
      role="img"
      aria-label="ドラッグで回せます"
    >
      {look.type === 'craft' ? (
        <div className="ov-craft-stage">
          <div ref={craftRef} className="ov-craft">
            <CraftIcon size={size * 0.7} />
          </div>
        </div>
      ) : (
        <canvas ref={canvasRef} className="ov-canvas" style={{ width: size, height: size }} />
      )}
    </div>
  );
});

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
